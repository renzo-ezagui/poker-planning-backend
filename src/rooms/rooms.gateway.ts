import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { v4 as uuid } from 'uuid';
import { Room, RoomDocument } from './schemas/room.schema';
import { Participant, ParticipantDocument } from './schemas/participant.schema';
import { VoteRound, VoteRoundDocument } from './schemas/vote-round.schema';
import { sanitizeText } from '../common/sanitize';
import { exportRoomHistory } from './rooms.export';
import { computeStats } from '../common/stats';
import { isValidVoteValue } from '../common/deck-values';
import { clientIpFromRequest } from '../common/client-ip';
import { allowedOrigins } from '../common/origins';
import { isRoomExpired, normalizeRoomCode } from './rooms.service';

const CHAT_RATE_LIMIT_MAX = 5;
const CHAT_RATE_LIMIT_WINDOW_MS = 3000;
const JOIN_RATE_LIMIT_MAX = 10;
const JOIN_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_TIMER_MS = 60 * 60_000;
const EXPIRY_SWEEP_MS = 60_000;

interface SocketData {
  adminId?: string;
  ip?: string;
  roomCode?: string;
  participantId?: string;
}

export interface RosterEntry {
  participantId: string;
  name: string;
  isSpectator: boolean;
  isHost: boolean;
  muted: boolean;
  connected: boolean;
}

function data(client: Socket): SocketData {
  return client.data as SocketData;
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && Types.ObjectId.isValid(value);
}

@WebSocketGateway({
  cors: { origin: allowedOrigins(), credentials: true },
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(RoomsGateway.name);
  // ephemeral, in-memory rate limit state — never persisted
  private chatTimestamps = new Map<string, number[]>();
  private joinAttempts = new Map<string, number[]>();
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(Participant.name) private participantModel: Model<ParticipantDocument>,
    @InjectModel(VoteRound.name) private voteRoundModel: Model<VoteRoundDocument>,
    private jwtService: JwtService,
  ) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => {
      this.closeExpiredRooms().catch((err) => this.logger.error(`expiry sweep failed: ${err}`));
    }, EXPIRY_SWEEP_MS);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  handleConnection(client: Socket) {
    if (client.request) data(client).ip = clientIpFromRequest(client.request);

    const cookieHeader = client.handshake?.headers?.cookie;
    if (!cookieHeader) return;
    const token = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('admin_jwt='))
      ?.slice('admin_jwt='.length);
    if (!token) return;

    try {
      const payload = this.jwtService.verify(token, { secret: process.env.JWT_SECRET });
      data(client).adminId = payload.sub;
    } catch {
      // invalid/expired token — admin actions will be rejected by assertRoomAdmin
    }
  }

  async handleDisconnect(client: Socket) {
    this.chatTimestamps.delete(client.id);
    const { roomCode, participantId } = data(client);
    if (!participantId) return;
    // only clear presence if this socket is still the participant's live one
    // (a reconnect may already have attached a newer socket)
    await this.participantModel.updateOne(
      { _id: participantId, socketId: client.id },
      { connected: false, socketId: null },
    );
    if (roomCode) await this.broadcastRoster(roomCode);
  }

  // ─── join ────────────────────────────────────────────────────────────────

  @SubscribeMessage('join')
  async handleJoin(
    client: Socket,
    payload: { roomCode: string; name: string; token?: string; isSpectator?: boolean },
  ) {
    const roomCode = normalizeRoomCode(payload?.roomCode);
    if (!roomCode) return this.fail(client, 'room not found or closed', 'room_not_found');

    const ip = data(client).ip ?? '';
    if (!this.allowJoinAttempt(`${ip}|${roomCode}`)) {
      return this.fail(client, 'too many join attempts, wait a minute', 'rate_limited');
    }

    const room = await this.roomModel.findOne({ code: roomCode, status: 'open' });
    if (!room) return this.fail(client, 'room not found or closed', 'room_not_found');
    if (isRoomExpired(room)) {
      await this.closeRoom(room, 'expired');
      return this.fail(client, 'this room has expired', 'room_not_found');
    }

    const isHost = Boolean(data(client).adminId && data(client).adminId === room.adminId?.toString());
    if (!isHost && ip && (room.bannedIps ?? []).includes(ip)) {
      return this.fail(client, 'you have been banned from this room', 'banned');
    }

    let participant: ParticipantDocument | null = null;
    if (typeof payload.token === 'string' && payload.token.length <= 64) {
      const candidate = await this.participantModel.findOne({ token: payload.token });
      // token must belong to THIS room — reject cross-room reuse
      if (candidate && candidate.roomId?.toString() === room._id.toString()) {
        participant = candidate;
      }
    }

    if (!participant) {
      const safeName = sanitizeText(typeof payload.name === 'string' ? payload.name : '', 40);
      if (!safeName) return this.fail(client, 'please enter a name', 'invalid_name');

      const present = await this.participantModel.find({ roomId: room._id, connected: true });
      if ((present ?? []).some((p) => p.name?.toLowerCase() === safeName.toLowerCase())) {
        return this.fail(client, `the name "${safeName}" is already taken in this room`, 'name_in_use');
      }

      participant = await this.participantModel.create({
        roomId: room._id,
        name: safeName,
        token: uuid(),
        socketId: client.id,
        connected: true,
        isSpectator: Boolean(payload.isSpectator),
        isHost,
        ip,
      });
    } else {
      // an older tab of the same participant loses its seat to this one
      if (participant.socketId && participant.socketId !== client.id) {
        this.server.in(participant.socketId).disconnectSockets(true);
      }
      participant.socketId = client.id;
      participant.connected = true;
      participant.ip = ip;
      if (isHost) participant.isHost = true;
      await participant.save?.();
    }

    data(client).roomCode = roomCode;
    data(client).participantId = participant._id.toString();
    client.join(roomCode);

    client.emit('joined', {
      participantId: participant._id.toString(),
      token: participant.token,
      role: participant.isSpectator ? 'spectator' : 'voter',
      isHost: Boolean(participant.isHost),
      muted: Boolean(participant.muted),
      roomState: await this.roomState(room),
    });

    await this.broadcastRoster(roomCode);
  }

  // ─── voting ──────────────────────────────────────────────────────────────

  @SubscribeMessage('vote:cast')
  async handleVoteCast(client: Socket, payload: { roomCode?: string; value: string }) {
    const participantId = data(client).participantId;
    const roomCode = data(client).roomCode;
    if (!participantId || !roomCode) return this.fail(client, 'join the room first');
    if (payload?.roomCode && normalizeRoomCode(payload.roomCode) !== roomCode) {
      return this.fail(client, 'participant does not belong to this room');
    }

    const participant = await this.participantModel.findById(participantId);
    if (!participant || participant.socketId !== client.id) {
      return this.fail(client, 'not authorized for this participant');
    }
    if (participant.isSpectator) return this.fail(client, 'spectators cannot vote');

    const room = await this.roomModel.findOne({ code: roomCode, status: 'open' });
    if (!room || participant.roomId?.toString() !== room._id?.toString()) {
      return this.fail(client, 'participant does not belong to this room');
    }
    if (typeof payload?.value !== 'string' || !isValidVoteValue(room.deckType, payload.value)) {
      return this.fail(client, "invalid vote value for this room's deck");
    }

    const voteRound = await this.currentRound(room._id);
    if (!voteRound || voteRound.revealedAt) return this.fail(client, 'no active round to vote on');

    const existing = voteRound.votes.find((v: any) => v.participantId.toString() === participantId);
    if (existing) {
      existing.value = payload.value;
    } else {
      voteRound.votes.push({ participantId: participant._id, value: payload.value } as any);
    }
    await voteRound.save?.();
    this.server.to(roomCode).emit('participant:voted', { participantId });
  }

  @SubscribeMessage('round:start')
  async handleRoundStart(client: Socket, payload: { roomCode: string; topic: string }) {
    const room = await this.assertRoomAdmin(client, payload?.roomCode);
    if (!room) return;
    const safeTopic = sanitizeText(typeof payload.topic === 'string' ? payload.topic : '', 280);
    room.currentTopic = safeTopic;
    room.revealState = 'hidden';
    room.timerEndsAt = null;
    await room.save?.();
    await this.voteRoundModel.create({ roomId: room._id, topic: safeTopic, votes: [] });
    this.server.to(room.code).emit('round:start', { topic: safeTopic });
  }

  @SubscribeMessage('round:reveal')
  async handleRoundReveal(client: Socket, payload: { roomCode: string }) {
    const room = await this.assertRoomAdmin(client, payload?.roomCode);
    if (!room) return;
    const voteRound = await this.currentRound(room._id);
    if (!voteRound) return this.fail(client, 'start a round before revealing');

    room.revealState = 'revealed';
    room.timerEndsAt = null;
    await room.save?.();

    voteRound.stats = this.statsFor(voteRound.votes) as any;
    voteRound.revealedAt = new Date();
    await voteRound.save?.();
    this.server.to(room.code).emit('round:reveal', this.revealPayload(voteRound));
  }

  @SubscribeMessage('round:revote')
  async handleRoundRevote(client: Socket, payload: { roomCode: string }) {
    const room = await this.assertRoomAdmin(client, payload?.roomCode);
    if (!room) return;
    room.revealState = 'hidden';
    room.timerEndsAt = null;
    await room.save?.();
    const voteRound = await this.currentRound(room._id);
    if (voteRound) {
      voteRound.votes = [];
      voteRound.revealedAt = null;
      voteRound.stats = null;
      await voteRound.save?.();
    }
    this.server.to(room.code).emit('round:revote', {});
  }

  @SubscribeMessage('timer:start')
  async handleTimerStart(client: Socket, payload: { roomCode: string; endsAt: number }) {
    const room = await this.assertRoomAdmin(client, payload?.roomCode);
    if (!room) return;
    const endsAt = Number(payload.endsAt);
    const now = Date.now();
    if (!Number.isFinite(endsAt) || endsAt <= now || endsAt > now + MAX_TIMER_MS) {
      return this.fail(client, 'timer must end within the next hour');
    }
    room.timerEndsAt = new Date(endsAt);
    await room.save?.();
    this.server.to(room.code).emit('timer:start', { endsAt });
  }

  // ─── chat ────────────────────────────────────────────────────────────────

  @SubscribeMessage('chat:message')
  async handleChatMessage(client: Socket, payload: { roomCode?: string; text: string }) {
    const now = Date.now();
    const recent = (this.chatTimestamps.get(client.id) ?? []).filter(
      (ts) => now - ts < CHAT_RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length >= CHAT_RATE_LIMIT_MAX) {
      return this.fail(client, 'chat rate limit exceeded, slow down');
    }
    recent.push(now);
    this.chatTimestamps.set(client.id, recent);

    const { participantId, roomCode } = data(client);
    if (!participantId || !roomCode) return this.fail(client, 'not a member of this room');
    const participant = await this.participantModel.findById(participantId);
    if (!participant || participant.socketId !== client.id) {
      return this.fail(client, 'not a member of this room');
    }
    if (participant.muted) return this.fail(client, 'the host has muted you', 'muted');

    const safeText = sanitizeText(typeof payload?.text === 'string' ? payload.text : '', 500);
    if (!safeText) return;
    this.server.to(roomCode).emit('chat:message', {
      participantId,
      name: participant.name,
      text: safeText,
      ts: now,
    });
  }

  // ─── moderation ──────────────────────────────────────────────────────────

  @SubscribeMessage('participant:kick')
  async handleKick(client: Socket, payload: { roomCode: string; participantId: string }) {
    const target = await this.moderationTarget(client, payload);
    if (!target) return;
    const { room, participant } = target;
    await this.removeFromRoom(participant, 'kicked', 'The host removed you from the room.');
    await this.broadcastRoster(room.code);
  }

  @SubscribeMessage('participant:mute')
  async handleMute(client: Socket, payload: { roomCode: string; participantId: string; muted?: boolean }) {
    const target = await this.moderationTarget(client, payload);
    if (!target) return;
    const { room, participant } = target;
    const muted = payload.muted !== false;
    participant.muted = muted;
    await participant.save?.();
    if (participant.socketId) {
      this.server.to(participant.socketId).emit('moderation:muted', { muted });
    }
    this.server.to(room.code).emit('participant:muted', { participantId: participant._id.toString(), muted });
    await this.broadcastRoster(room.code);
  }

  @SubscribeMessage('participant:ban')
  async handleBan(client: Socket, payload: { roomCode: string; participantId: string }) {
    const target = await this.moderationTarget(client, payload);
    if (!target) return;
    const { room, participant } = target;
    if (participant.ip) {
      await this.roomModel.updateOne({ _id: room._id }, { $addToSet: { bannedIps: participant.ip } });
    }
    await this.removeFromRoom(participant, 'banned', 'The host banned you from this room.');
    await this.broadcastRoster(room.code);
    client.emit('bans:changed', {});
  }

  @SubscribeMessage('participant:unban')
  async handleUnban(client: Socket, payload: { roomCode: string; ip: string }) {
    const room = await this.assertRoomAdmin(client, payload?.roomCode);
    if (!room) return;
    if (typeof payload.ip !== 'string' || payload.ip.length > 64) return this.fail(client, 'invalid ip');
    await this.roomModel.updateOne({ _id: room._id }, { $pull: { bannedIps: payload.ip } });
    client.emit('bans:changed', {});
  }

  @SubscribeMessage('room:close')
  async handleRoomClose(client: Socket, payload: { roomCode: string }) {
    const room = await this.assertRoomAdmin(client, payload?.roomCode);
    if (!room) return;
    await this.closeRoom(room, 'closed');
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private fail(client: Socket, message: string, code?: string) {
    client.emit('error', { message, code });
  }

  private allowJoinAttempt(key: string): boolean {
    const now = Date.now();
    const recent = (this.joinAttempts.get(key) ?? []).filter((ts) => now - ts < JOIN_RATE_LIMIT_WINDOW_MS);
    if (recent.length >= JOIN_RATE_LIMIT_MAX) {
      this.joinAttempts.set(key, recent);
      return false;
    }
    recent.push(now);
    this.joinAttempts.set(key, recent);
    if (this.joinAttempts.size > 10_000) {
      for (const [k, ts] of this.joinAttempts) {
        if (ts.every((t) => now - t >= JOIN_RATE_LIMIT_WINDOW_MS)) this.joinAttempts.delete(k);
      }
    }
    return true;
  }

  private async assertRoomAdmin(client: Socket, rawCode: unknown) {
    const code = normalizeRoomCode(rawCode);
    const room = code ? await this.roomModel.findOne({ code }) : null;
    const adminId = data(client).adminId;
    if (!room || !adminId || adminId !== room.adminId?.toString()) {
      this.logger.warn(`rejected admin event from socket ${client.id} for room ${String(rawCode)}`);
      this.fail(client, 'not authorized for this room');
      return null;
    }
    if (room.status !== 'open') {
      this.fail(client, 'this room is closed');
      return null;
    }
    return room;
  }

  private async moderationTarget(client: Socket, payload: { roomCode: string; participantId: string }) {
    const room = await this.assertRoomAdmin(client, payload?.roomCode);
    if (!room) return null;
    if (!isObjectId(payload.participantId)) {
      this.fail(client, 'participant not found');
      return null;
    }
    const participant = await this.participantModel.findById(payload.participantId);
    if (!participant || participant.roomId?.toString() !== room._id.toString()) {
      this.fail(client, 'participant not found');
      return null;
    }
    if (participant.isHost) {
      this.fail(client, 'the host cannot be moderated');
      return null;
    }
    return { room, participant };
  }

  private async removeFromRoom(participant: ParticipantDocument, reason: 'kicked' | 'banned', message: string) {
    const socketId = participant.socketId;
    participant.connected = false;
    participant.socketId = null;
    await participant.save?.();
    if (socketId) {
      this.server.to(socketId).emit('moderation:removed', { reason, message });
      this.server.in(socketId).disconnectSockets(true);
    }
  }

  private async currentRound(roomId: any) {
    return this.voteRoundModel.findOne({ roomId }).sort({ createdAt: -1 });
  }

  private statsFor(votes: { value: string }[]) {
    // '?' means "not sure" — it doesn't count against numeric stats
    const counted = votes.filter((v) => v.value !== '?');
    const numeric = counted.map((v) => Number(v.value)).filter((n) => !Number.isNaN(n));
    return numeric.length > 0 && numeric.length === counted.length ? computeStats(numeric) : null;
  }

  private revealPayload(voteRound: VoteRoundDocument) {
    return {
      votes: voteRound.votes.map((v: any) => ({
        participantId: v.participantId.toString(),
        value: v.value,
      })),
      stats: voteRound.stats ?? null,
    };
  }

  private async roster(roomId: any): Promise<RosterEntry[]> {
    const participants = (await this.participantModel.find({ roomId, connected: true })) ?? [];
    return participants.map((p) => ({
      participantId: p._id.toString(),
      name: p.name,
      isSpectator: Boolean(p.isSpectator),
      isHost: Boolean(p.isHost),
      muted: Boolean(p.muted),
      connected: true,
    }));
  }

  private async broadcastRoster(roomCode: string) {
    const room = await this.roomModel.findOne({ code: roomCode });
    if (!room) return;
    this.server.to(roomCode).emit('participant:update', { participants: await this.roster(room._id) });
  }

  private async roomState(room: RoomDocument) {
    const voteRound = await this.currentRound(room._id);
    const revealed = Boolean(voteRound?.revealedAt);
    return {
      code: room.code,
      deckType: room.deckType,
      topic: room.currentTopic ?? '',
      roundActive: Boolean(voteRound),
      revealState: revealed ? 'revealed' : 'hidden',
      timerEndsAt: room.timerEndsAt ? new Date(room.timerEndsAt).getTime() : null,
      expiresAt: room.expiresAt ? new Date(room.expiresAt).getTime() : null,
      votedIds: voteRound ? voteRound.votes.map((v: any) => v.participantId.toString()) : [],
      reveal: voteRound && revealed ? this.revealPayload(voteRound) : null,
      participants: await this.roster(room._id),
    };
  }

  private async closeRoom(room: RoomDocument, reason: 'closed' | 'expired') {
    room.status = 'closed';
    await room.save?.();
    const rounds = (await this.voteRoundModel.find({ roomId: room._id }).sort({ createdAt: 1 })) ?? [];
    const people = (await this.participantModel.find({ roomId: room._id })) ?? [];
    const names = new Map(people.map((p) => [p._id.toString(), p.name] as [string, string]));
    const csv = exportRoomHistory(rounds as any, names);
    this.server.to(room.code).emit('room:close', { exportCsv: csv, reason });
    await this.participantModel.updateMany({ roomId: room._id }, { connected: false, socketId: null });
    this.server.in(room.code).disconnectSockets(true);
  }

  private async closeExpiredRooms() {
    const expired = await this.roomModel.find({ status: 'open', expiresAt: { $lte: new Date() } });
    for (const room of expired) await this.closeRoom(room, 'expired');
  }
}

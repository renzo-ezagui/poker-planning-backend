import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { v4 as uuid } from 'uuid';
import { Room, RoomDocument } from './schemas/room.schema';
import { Participant, ParticipantDocument } from './schemas/participant.schema';
import { VoteRound, VoteRoundDocument } from './schemas/vote-round.schema';
import { sanitizeText } from '../common/sanitize';
import { exportRoomHistory } from './rooms.export';
import { computeStats } from '../common/stats';
import { isValidVoteValue } from '../common/deck-values';

const CHAT_RATE_LIMIT_MAX = 5;
const CHAT_RATE_LIMIT_WINDOW_MS = 3000;

@WebSocketGateway({
  cors: { origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173', credentials: true },
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // per-socket chat rate limiting — ephemeral, in-memory, not persisted
  private chatTimestamps = new Map<string, number[]>();

  constructor(
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(Participant.name) private participantModel: Model<ParticipantDocument>,
    @InjectModel(VoteRound.name) private voteRoundModel: Model<VoteRoundDocument>,
    private jwtService: JwtService,
  ) {}

  handleConnection(client: Socket) {
    const cookieHeader = client.handshake.headers.cookie;
    if (!cookieHeader) return;

    const token = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('admin_jwt='))
      ?.slice('admin_jwt='.length);
    if (!token) return;

    try {
      const payload = this.jwtService.verify(token, { secret: process.env.JWT_SECRET });
      (client.data as any).adminId = payload.sub;
    } catch {
      // invalid/expired token — leave adminId unset, admin actions will be
      // rejected by assertRoomAdmin same as an unauthenticated connection
    }
  }

  @SubscribeMessage('join')
  async handleJoin(
    client: Socket,
    payload: { roomCode: string; name: string; token?: string; isSpectator?: boolean },
  ) {
    const room = await this.roomModel.findOne({ code: payload.roomCode, status: 'open' });
    if (!room) {
      client.emit('error', { message: 'room not found or closed' });
      return;
    }

    let participant: ParticipantDocument | null = null;
    if (payload.token) {
      const candidate = await this.participantModel.findOne({ token: payload.token });
      // token must belong to THIS room — reject cross-room reuse
      if (candidate && candidate.roomId.toString() === room._id.toString()) {
        participant = candidate;
      }
    }

    const safeName = sanitizeText(payload.name, 40);

    if (!participant) {
      participant = await this.participantModel.create({
        roomId: room._id,
        name: safeName,
        token: uuid(),
        socketId: client.id,
        connected: true,
        isSpectator: Boolean(payload.isSpectator),
      });
    } else {
      participant.socketId = client.id;
      participant.connected = true;
      await participant.save?.();
    }

    client.join(payload.roomCode);
    client.emit('joined', {
      participantId: participant._id,
      token: participant.token,
      role: participant.isSpectator ? 'spectator' : 'voter',
      roomState: { code: room.code, deckType: (room as any).deckType },
    });

    this.server.to(payload.roomCode).emit('participant:update', { updated: true });
  }

  async handleDisconnect(client: Socket) {
    await this.participantModel.updateMany(
      { socketId: client.id },
      { connected: false, socketId: null },
    );
    this.chatTimestamps.delete(client.id);
  }

  private async assertRoomAdmin(client: Socket, roomCode: string) {
    const room = await this.roomModel.findOne({ code: roomCode });
    if (!room || (client as any).data?.adminId !== room.adminId?.toString()) {
      client.emit('error', { message: 'not authorized for this room' });
      return null;
    }
    return room;
  }

  @SubscribeMessage('vote:cast')
  async handleVoteCast(
    client: Socket,
    payload: { participantId: string; roomCode: string; value: string },
  ) {
    const participant = await this.participantModel.findById(payload.participantId);
    if (!participant || participant.isSpectator) {
      client.emit('error', { message: 'spectators cannot vote' });
      return;
    }
    // the participantId in the payload is client-supplied — prove this
    // socket actually owns that participant before accepting the vote
    if (participant.socketId !== client.id) {
      client.emit('error', { message: 'not authorized for this participant' });
      return;
    }
    const room = await this.roomModel.findOne({ code: payload.roomCode });
    if (!room || participant.roomId?.toString() !== room._id?.toString()) {
      client.emit('error', { message: 'participant does not belong to this room' });
      return;
    }
    if (!isValidVoteValue((room as any).deckType, payload.value)) {
      client.emit('error', { message: "invalid vote value for this room's deck" });
      return;
    }
    const voteRound = await this.voteRoundModel
      .findOne({ roomId: room._id })
      .sort({ createdAt: -1 });
    if (!voteRound || (voteRound as any).revealedAt) {
      client.emit('error', { message: 'no active round to vote on' });
      return;
    }
    const existing = voteRound.votes.find(
      (v: any) => v.participantId.toString() === payload.participantId,
    );
    if (existing) {
      existing.value = payload.value;
    } else {
      voteRound.votes.push({ participantId: participant._id, value: payload.value } as any);
    }
    await (voteRound as any).save?.();
    this.server.to(payload.roomCode).emit('participant:voted', {
      participantId: payload.participantId,
    });
  }

  @SubscribeMessage('round:start')
  async handleRoundStart(client: Socket, payload: { roomCode: string; topic: string }) {
    const room = await this.assertRoomAdmin(client, payload.roomCode);
    if (!room) return;
    const safeTopic = sanitizeText(payload.topic, 280);
    room.currentTopic = safeTopic;
    room.revealState = 'hidden';
    await (room as any).save?.();
    await this.voteRoundModel.create({ roomId: room._id, topic: safeTopic, votes: [] });
    this.server.to(payload.roomCode).emit('round:start', { topic: safeTopic });
  }

  @SubscribeMessage('round:reveal')
  async handleRoundReveal(client: Socket, payload: { roomCode: string }) {
    const room = await this.assertRoomAdmin(client, payload.roomCode);
    if (!room) return;
    room.revealState = 'revealed';
    await (room as any).save?.();
    const voteRound = await this.voteRoundModel
      .findOne({ roomId: room._id })
      .sort({ createdAt: -1 });
    if (!voteRound) {
      this.server.to(payload.roomCode).emit('round:reveal', { votes: [], stats: null });
      return;
    }
    const numericValues = voteRound.votes
      .map((v: any) => Number(v.value))
      .filter((n: number) => !Number.isNaN(n));
    const stats =
      numericValues.length === voteRound.votes.length && numericValues.length > 0
        ? computeStats(numericValues)
        : null;
    voteRound.revealedAt = new Date();
    voteRound.stats = stats as any;
    await (voteRound as any).save?.();
    this.server.to(payload.roomCode).emit('round:reveal', {
      votes: voteRound.votes.map((v: any) => ({
        participantId: v.participantId.toString(),
        value: v.value,
      })),
      stats,
    });
  }

  @SubscribeMessage('round:revote')
  async handleRoundRevote(client: Socket, payload: { roomCode: string }) {
    const room = await this.assertRoomAdmin(client, payload.roomCode);
    if (!room) return;
    room.revealState = 'hidden';
    await (room as any).save?.();
    const voteRound = await this.voteRoundModel
      .findOne({ roomId: room._id })
      .sort({ createdAt: -1 });
    if (voteRound) {
      voteRound.votes = [];
      (voteRound as any).revealedAt = null;
      await (voteRound as any).save?.();
    }
    this.server.to(payload.roomCode).emit('round:revote', {});
  }

  @SubscribeMessage('timer:start')
  async handleTimerStart(client: Socket, payload: { roomCode: string; endsAt: number }) {
    const room = await this.assertRoomAdmin(client, payload.roomCode);
    if (!room) return;
    room.timerEndsAt = new Date(payload.endsAt);
    await (room as any).save?.();
    this.server.to(payload.roomCode).emit('timer:start', { endsAt: payload.endsAt });
  }

  @SubscribeMessage('chat:message')
  async handleChatMessage(client: Socket, payload: { roomCode: string; text: string }) {
    const now = Date.now();
    const recent = (this.chatTimestamps.get(client.id) ?? []).filter(
      (ts) => now - ts < CHAT_RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length >= CHAT_RATE_LIMIT_MAX) {
      client.emit('error', { message: 'chat rate limit exceeded, slow down' });
      return;
    }
    recent.push(now);
    this.chatTimestamps.set(client.id, recent);

    const participant = await this.participantModel.findOne({ socketId: client.id });
    const room = await this.roomModel.findOne({ code: payload.roomCode });
    if (!participant || !room || participant.roomId?.toString() !== room._id?.toString()) {
      client.emit('error', { message: 'not a member of this room' });
      return;
    }
    const safeText = sanitizeText(payload.text, 500);
    this.server.to(payload.roomCode).emit('chat:message', {
      name: participant.name,
      text: safeText,
      ts: now,
    });
  }

  @SubscribeMessage('participant:kick')
  async handleKick(client: Socket, payload: { roomCode: string; participantId: string }) {
    const room = await this.assertRoomAdmin(client, payload.roomCode);
    if (!room) return;
    await this.participantModel.findByIdAndUpdate(payload.participantId, { connected: false });
    this.server.to(payload.roomCode).emit('participant:update', { kicked: payload.participantId });
  }

  @SubscribeMessage('participant:mute')
  async handleMute(client: Socket, payload: { roomCode: string; participantId: string }) {
    const room = await this.assertRoomAdmin(client, payload.roomCode);
    if (!room) return;
    this.server.to(payload.roomCode).emit('participant:muted', { participantId: payload.participantId });
  }

  @SubscribeMessage('room:close')
  async handleRoomClose(client: Socket, payload: { roomCode: string }) {
    const room = await this.assertRoomAdmin(client, payload.roomCode);
    if (!room) return;
    room.status = 'closed';
    await (room as any).save?.();
    const rounds = await this.voteRoundModel.find({ roomId: room._id });
    const csv = exportRoomHistory(rounds as any);
    this.server.to(payload.roomCode).emit('room:close', { exportCsv: csv });
    const roomSockets = await this.server.in(payload.roomCode).fetchSockets();
    for (const s of roomSockets) {
      s.disconnect(true);
    }
  }
}

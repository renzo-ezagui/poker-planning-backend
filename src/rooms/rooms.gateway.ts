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

@WebSocketGateway({
  cors: { origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173', credentials: true },
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

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
    payload: { roomCode: string; name: string; token?: string },
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
        isSpectator: false,
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
      client.emit('error', { message: 'not authorized to cast this vote' });
      return;
    }
    const room = await this.roomModel.findOne({ code: payload.roomCode });
    if (!room || participant.roomId?.toString() !== room._id?.toString()) {
      client.emit('error', { message: 'not authorized to cast this vote' });
      return;
    }
    this.server.to(payload.roomCode).emit('participant:voted', {
      participantId: payload.participantId,
    });
    // actual value stored server-side only, not broadcast until reveal
    (client.data as any).pendingVote = payload.value;
  }

  @SubscribeMessage('round:start')
  async handleRoundStart(client: Socket, payload: { roomCode: string; topic: string }) {
    const room = await this.assertRoomAdmin(client, payload.roomCode);
    if (!room) return;
    const safeTopic = sanitizeText(payload.topic, 280);
    room.currentTopic = safeTopic;
    room.revealState = 'hidden';
    await (room as any).save?.();
    this.server.to(payload.roomCode).emit('round:start', { topic: safeTopic });
  }

  @SubscribeMessage('round:reveal')
  async handleRoundReveal(client: Socket, payload: { roomCode: string }) {
    const room = await this.assertRoomAdmin(client, payload.roomCode);
    if (!room) return;
    room.revealState = 'revealed';
    await (room as any).save?.();
    this.server.to(payload.roomCode).emit('round:reveal', {});
  }

  @SubscribeMessage('round:revote')
  async handleRoundRevote(client: Socket, payload: { roomCode: string }) {
    const room = await this.assertRoomAdmin(client, payload.roomCode);
    if (!room) return;
    room.revealState = 'hidden';
    await (room as any).save?.();
    this.server.to(payload.roomCode).emit('round:revote', {});
  }
}

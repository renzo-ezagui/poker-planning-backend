import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { InjectModel } from '@nestjs/mongoose';
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
export class RoomsGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(Participant.name) private participantModel: Model<ParticipantDocument>,
    @InjectModel(VoteRound.name) private voteRoundModel: Model<VoteRoundDocument>,
  ) {}

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
}

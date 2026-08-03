import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Room, RoomDocument, DECK_TYPES, DeckType } from './schemas/room.schema';
import { generateRoomCode } from '../common/room-code';

@Injectable()
export class RoomsService {
  constructor(@InjectModel(Room.name) private roomModel: Model<RoomDocument>) {}

  async createRoom(adminId: string, deckType: DeckType, expiresInHours: number) {
    if (!DECK_TYPES.includes(deckType)) {
      throw new BadRequestException('invalid deckType');
    }
    return this.roomModel.create({
      code: generateRoomCode(),
      adminId,
      deckType,
      status: 'open',
      expiresAt: new Date(Date.now() + expiresInHours * 3600_000),
    });
  }

  async getByCode(code: string) {
    return this.roomModel.findOne({ code });
  }
}

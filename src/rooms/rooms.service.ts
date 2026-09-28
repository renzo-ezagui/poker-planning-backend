import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Room, RoomDocument, DECK_TYPES, DeckType, ThemeId } from './schemas/room.schema';
import { generateRoomCode } from '../common/room-code';

export const ROOM_CODE_PATTERN = /^[A-Z0-9]{8,12}$/;

export function normalizeRoomCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const upper = code.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(upper) ? upper : null;
}

export function isRoomExpired(room: { expiresAt?: Date | null }): boolean {
  return Boolean(room.expiresAt && new Date(room.expiresAt).getTime() <= Date.now());
}

/** The only room fields ever sent to unauthenticated clients. */
export function publicRoomView(room: any) {
  return {
    code: room.code,
    deckType: room.deckType,
    theme: room.theme ?? 'cardroom',
    status: room.status === 'open' && isRoomExpired(room) ? 'closed' : room.status,
    currentTopic: room.currentTopic ?? '',
    revealState: room.revealState,
    timerEndsAt: room.timerEndsAt ?? null,
    expiresAt: room.expiresAt,
  };
}

@Injectable()
export class RoomsService {
  constructor(@InjectModel(Room.name) private roomModel: Model<RoomDocument>) {}

  async createRoom(adminId: string, deckType: DeckType, expiresInHours: number, theme: ThemeId = 'cardroom') {
    if (!DECK_TYPES.includes(deckType)) {
      throw new BadRequestException('invalid deckType');
    }
    return this.roomModel.create({
      code: generateRoomCode(),
      adminId,
      deckType,
      status: 'open',
      theme,
      expiresAt: new Date(Date.now() + expiresInHours * 3600_000),
    });
  }

  async getByCode(code: string) {
    const normalized = normalizeRoomCode(code);
    if (!normalized) return null;
    return this.roomModel.findOne({ code: normalized });
  }

  async listForAdmin(adminId: string) {
    return this.roomModel
      .find({ adminId, status: 'open', expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .limit(20);
  }
}

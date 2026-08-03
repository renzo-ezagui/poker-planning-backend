import { IsIn, IsInt, Min, Max } from 'class-validator';
import { DECK_TYPES } from '../schemas/room.schema';
import type { DeckType } from '../schemas/room.schema';

export class CreateRoomDto {
  @IsIn(DECK_TYPES)
  deckType: DeckType;

  @IsInt()
  @Min(1)
  @Max(72)
  expiresInHours: number;
}

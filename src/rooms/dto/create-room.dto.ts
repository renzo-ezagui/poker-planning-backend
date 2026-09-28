import { IsIn, IsInt, IsOptional, Min, Max } from 'class-validator';
import { DECK_TYPES, THEMES } from '../schemas/room.schema';
import type { DeckType, ThemeId } from '../schemas/room.schema';

export class CreateRoomDto {
  @IsIn(DECK_TYPES)
  deckType: DeckType;

  @IsInt()
  @Min(1)
  @Max(72)
  expiresInHours: number;

  @IsOptional()
  @IsIn(THEMES)
  theme?: ThemeId;
}

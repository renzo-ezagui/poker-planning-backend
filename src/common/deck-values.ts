import { DeckType } from '../rooms/schemas/room.schema';

export const DECK_VALUES: Record<DeckType, string[]> = {
  fibonacci: ['0', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL', '?'],
};

export function isValidVoteValue(deckType: DeckType, value: string): boolean {
  return DECK_VALUES[deckType]?.includes(value) ?? false;
}

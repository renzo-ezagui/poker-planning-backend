import { isValidVoteValue } from './deck-values';

describe('isValidVoteValue', () => {
  it('accepts a valid fibonacci value', () => {
    expect(isValidVoteValue('fibonacci', '5')).toBe(true);
  });

  it('rejects a value not in the deck', () => {
    expect(isValidVoteValue('fibonacci', 'XL')).toBe(false);
  });

  it('accepts a valid tshirt value', () => {
    expect(isValidVoteValue('tshirt', 'M')).toBe(true);
  });
});

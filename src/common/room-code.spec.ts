import { generateRoomCode } from './room-code';

describe('generateRoomCode', () => {
  it('produces an 8-character uppercase alphanumeric code', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('produces different codes across calls', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateRoomCode()));
    expect(codes.size).toBe(100);
  });
});

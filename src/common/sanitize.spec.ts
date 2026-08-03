import { sanitizeText } from './sanitize';

describe('sanitizeText', () => {
  it('strips HTML tags', () => {
    expect(sanitizeText('<script>alert(1)</script>hi', 100)).toBe('hi');
  });

  it('truncates to maxLength', () => {
    expect(sanitizeText('a'.repeat(50), 10)).toHaveLength(10);
  });

  it('trims whitespace', () => {
    expect(sanitizeText('  hello  ', 100)).toBe('hello');
  });
});

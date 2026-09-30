import { throttleLimit } from './throttle';

describe('throttleLimit', () => {
  const ENV_VAR = 'TEST_THROTTLE_LIMIT';

  afterEach(() => {
    delete process.env[ENV_VAR];
  });

  it('returns the fallback when the env var is unset', () => {
    delete process.env[ENV_VAR];
    expect(throttleLimit(ENV_VAR, 5)).toBe(5);
  });

  it('returns the parsed override when the env var is a positive number', () => {
    process.env[ENV_VAR] = '500';
    expect(throttleLimit(ENV_VAR, 5)).toBe(500);
  });

  it('falls back on a non-numeric value', () => {
    process.env[ENV_VAR] = 'not-a-number';
    expect(throttleLimit(ENV_VAR, 5)).toBe(5);
  });

  it('falls back on zero or negative overrides (never disables the limiter)', () => {
    process.env[ENV_VAR] = '0';
    expect(throttleLimit(ENV_VAR, 5)).toBe(5);
    process.env[ENV_VAR] = '-3';
    expect(throttleLimit(ENV_VAR, 5)).toBe(5);
  });
});

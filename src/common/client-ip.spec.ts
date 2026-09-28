import { isPrivateIp, resolveClientIp } from './client-ip';

describe('isPrivateIp', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.5', '::1', '::ffff:192.168.1.5', 'fd00::1'])(
    '%s is private',
    (ip) => expect(isPrivateIp(ip)).toBe(true),
  );
  it.each(['8.8.8.8', '172.32.0.1', '2606:4700::1', 'garbage'])('%s is not private', (ip) =>
    expect(isPrivateIp(ip)).toBe(false),
  );
});

describe('resolveClientIp', () => {
  it('ignores X-Forwarded-For when proxy trust is off', () => {
    expect(resolveClientIp('127.0.0.1', '1.2.3.4', 'none')).toBe('127.0.0.1');
  });

  it('ignores X-Forwarded-For when the direct peer is public (not our proxy)', () => {
    expect(resolveClientIp('9.9.9.9', '1.2.3.4', 'private')).toBe('9.9.9.9');
  });

  it('takes the right-most untrusted hop, so a client cannot spoof by prepending', () => {
    expect(resolveClientIp('172.18.0.1', '6.6.6.6, 1.2.3.4, 127.0.0.1', 'private')).toBe('1.2.3.4');
  });

  it('falls back to the left-most hop when every hop is private (LAN client)', () => {
    expect(resolveClientIp('172.18.0.1', '192.168.1.50', 'private')).toBe('192.168.1.50');
  });

  it('normalizes IPv4-mapped IPv6 remote addresses', () => {
    expect(resolveClientIp('::ffff:8.8.8.8', undefined, 'none')).toBe('8.8.8.8');
  });
});

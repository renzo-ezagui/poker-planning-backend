import type { IncomingMessage } from 'http';
import { isIP } from 'net';

/**
 * TRUST_PROXY controls whether X-Forwarded-For is honoured when resolving the
 * real client IP (used for bans and rate limits):
 *   unset / "false" → never trust it, use the socket's remote address
 *   "private"       → trust hops on loopback / private / link-local addresses
 *                      (typical: app behind a reverse proxy on the same host/LAN)
 *
 * Trusting XFF without a proxy in front lets any client spoof its IP and evade
 * bans, so this is opt-in.
 */
export type TrustProxyMode = 'none' | 'private';

export function trustProxyMode(value = process.env.TRUST_PROXY): TrustProxyMode {
  return value === 'private' ? 'private' : 'none';
}

/** Equivalent value for Express' `trust proxy` setting. */
export function expressTrustProxy(mode: TrustProxyMode): string | false {
  return mode === 'private' ? 'loopback, linklocal, uniquelocal' : false;
}

export function normalizeIp(raw: string): string {
  const ip = raw.trim();
  return ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

export function isPrivateIp(raw: string): boolean {
  const ip = normalizeIp(raw);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      /^fe[89ab]/.test(lower)
    );
  }
  return false;
}

export function resolveClientIp(
  remoteAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  mode: TrustProxyMode,
): string {
  const remote = normalizeIp(remoteAddress ?? '');
  if (mode === 'none' || !isPrivateIp(remote)) return remote;

  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? '');
  const hops = header
    .split(',')
    .map((h) => normalizeIp(h))
    .filter((h) => isIP(h) !== 0);
  // walk right-to-left: the first hop that isn't one of our own proxies is the client
  for (let i = hops.length - 1; i >= 0; i--) {
    if (!isPrivateIp(hops[i])) return hops[i];
  }
  return hops[0] ?? remote;
}

export function clientIpFromRequest(req: IncomingMessage, mode = trustProxyMode()): string {
  return resolveClientIp(req.socket?.remoteAddress, req.headers['x-forwarded-for'], mode);
}

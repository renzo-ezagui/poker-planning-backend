/**
 * Optional env override for @Throttle limits, so dev/testing environments
 * (repeated e2e runs, manual probing) don't self-exhaust the default rate
 * limit. Unset in prod — falls back to the exact original hardcoded value.
 * Evaluated once at module load (env vars are set before Nest reads
 * decorators), same as every other env-driven config in this codebase.
 */
export function throttleLimit(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

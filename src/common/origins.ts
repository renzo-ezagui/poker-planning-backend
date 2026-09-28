/** ALLOWED_ORIGIN may be a single origin or a comma-separated list. */
export function allowedOrigins(value = process.env.ALLOWED_ORIGIN): string[] {
  const list = (value ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (list.includes('*')) {
    throw new Error('ALLOWED_ORIGIN must be an explicit list of origins, "*" is not allowed');
  }
  return list;
}

export function computeStats(values: number[]) {
  if (values.length === 0) return { avg: 0, median: 0, variance: 0 };

  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;

  return { avg, median, variance };
}

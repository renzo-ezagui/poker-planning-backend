import { computeStats } from './stats';

describe('computeStats', () => {
  it('computes avg, median, variance for an odd-length set', () => {
    const result = computeStats([1, 3, 5]);
    expect(result.avg).toBeCloseTo(3);
    expect(result.median).toBe(3);
    expect(result.variance).toBeCloseTo(2.667, 2);
  });

  it('computes median for an even-length set', () => {
    const result = computeStats([1, 2, 3, 4]);
    expect(result.median).toBe(2.5);
  });

  it('returns zeros for an empty set', () => {
    expect(computeStats([])).toEqual({ avg: 0, median: 0, variance: 0 });
  });
});

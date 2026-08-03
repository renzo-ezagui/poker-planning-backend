import { exportRoomHistory } from './rooms.export';

describe('exportRoomHistory', () => {
  it('produces a CSV with topic and stats per round', () => {
    const csv = exportRoomHistory([
      { topic: 'Story 1', stats: { avg: 3, median: 3, variance: 0 } } as any,
      { topic: 'Story 2', stats: { avg: 5.5, median: 5, variance: 1.25 } } as any,
    ]);
    expect(csv).toContain('topic,avg,median,variance');
    expect(csv).toContain('Story 1,3,3,0');
    expect(csv).toContain('Story 2,5.5,5,1.25');
  });
});

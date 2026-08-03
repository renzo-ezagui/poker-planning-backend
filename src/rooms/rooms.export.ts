import { VoteRound } from './schemas/vote-round.schema';

export function exportRoomHistory(rounds: VoteRound[]): string {
  const header = 'topic,avg,median,variance';
  const rows = rounds.map(
    (r) => `${r.topic},${r.stats?.avg ?? ''},${r.stats?.median ?? ''},${r.stats?.variance ?? ''}`,
  );
  return [header, ...rows].join('\n');
}

import { VoteRound } from './schemas/vote-round.schema';

// quote when needed, and neutralise spreadsheet formula injection (=, +, -, @)
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportRoomHistory(
  rounds: VoteRound[],
  names: Map<string, string> = new Map(),
): string {
  const header = 'topic,avg,median,variance,votes';
  const rows = rounds.map((r) => {
    const votes = (r.votes ?? [])
      .map((v: any) => `${names.get(v.participantId?.toString()) ?? 'unknown'}: ${v.value}`)
      .join('; ');
    return [r.topic, r.stats?.avg, r.stats?.median, r.stats?.variance, votes].map(csvCell).join(',');
  });
  return [header, ...rows].join('\n');
}

import type { CodefleetStatusChangeHistoryEntry } from '../mcp/types';

function parseTime(value?: string): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function formatCodefleetTimestamp(value?: string): string | null {
  const time = parseTime(value);
  if (time === null) return value ?? null;
  const date = new Date(time);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function formatStatusTimestamp(value?: string): string | null {
  return formatCodefleetTimestamp(value);
}

export function getStatusTimeline(
  statusChangeHistory?: CodefleetStatusChangeHistoryEntry[],
): { status: string; at: string }[] {
  if (!statusChangeHistory) return [];

  return statusChangeHistory
    .filter((entry): entry is { to: string; changedAt: string } => Boolean(entry.to && entry.changedAt))
    .slice()
    .sort((a, b) => {
      const aTime = parseTime(a.changedAt);
      const bTime = parseTime(b.changedAt);
      if (aTime !== null && bTime !== null && aTime !== bTime) return aTime - bTime;
      return a.changedAt.localeCompare(b.changedAt);
    })
    .map((entry) => ({ status: entry.to, at: entry.changedAt }));
}

export function formatExecutionDuration(statusChangeHistory?: CodefleetStatusChangeHistoryEntry[]): string | null {
  if (!statusChangeHistory) return null;

  const startedAt = parseTime(
    statusChangeHistory.find((entry) => entry.to === 'in-progress' && entry.changedAt)?.changedAt,
  );
  const doneAt = parseTime(
    [...statusChangeHistory].reverse().find((entry) => entry.to === 'done' && entry.changedAt)?.changedAt,
  );
  if (startedAt === null || doneAt === null || doneAt < startedAt) return null;

  const totalMinutes = Math.floor((doneAt - startedAt) / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

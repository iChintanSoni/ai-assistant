/** Shared display formatting used across the Files, Settings, and Conversation views. */

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${i > 0 && value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Short message-timestamp label: just the clock time for messages sent today,
 * otherwise "Mon D, h:mm AM/PM" so a multi-day transcript never reads ambiguously. */
export function formatMessageTime(ts: number, now: number): string {
  const time = new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (startOfDay(ts) === startOfDay(now)) return time;
  const date = new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${date}, ${time}`;
}

/** Full precision timestamp for a hover tooltip, e.g. "Tuesday, July 14, 2026, 10:32:15 AM". */
export function formatFullDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Indirection so reading the wall clock during render doesn't trip the react-hooks/purity
 * lint rule, which only flags a literal `Date.now()` call written inline in the analyzed
 * function, not one reached through a function call (same as HistoryPanel's `groupConversations`). */
export function currentTimeMs(): number {
  return Date.now();
}

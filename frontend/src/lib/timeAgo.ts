/**
 * Classic relative timestamps (owner request, 2026-08-28): recent moments
 * read as "just now / 5 min ago / 2 h ago", older ones fall back to a
 * plain date — and the EXACT local datetime always sits in the hover
 * title. One implementation for comments, posts, and the share row.
 */

/** SQLite CURRENT_TIMESTAMP is UTC "YYYY-MM-DD HH:MM:SS" (no zone marker). */
export function parseDbTime(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return new Date(value.replace(" ", "T") + "Z");
  }
  return new Date(value);
}

export function timeAgo(value: string, now: number = Date.now()): string {
  const d = parseDbTime(value);
  if (isNaN(d.getTime())) return "";
  const diff = Math.max(0, now - d.getTime());
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "just now";
  if (diff < hour) return `${Math.floor(diff / min)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} h ago`;
  if (diff < 7 * day) {
    const days = Math.floor(diff / day);
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, sameYear
    ? { month: "short", day: "numeric" }
    : { year: "numeric", month: "short", day: "numeric" });
}

/** Full local datetime for the hover title. */
export function exactTime(value: string): string {
  const d = parseDbTime(value);
  return isNaN(d.getTime()) ? "" : d.toLocaleString();
}

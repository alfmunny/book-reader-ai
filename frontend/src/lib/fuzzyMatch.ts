/**
 * Lightweight fuzzy matcher for admin list filtering.
 *
 * Two tiers — a substring hit is preferred, a subsequence hit is a
 * fallback. Both sides are lowercased + stripped of Unicode marks so
 * "Gœthe" matches "goethe", "Faust — der Tragödie" matches "faust".
 *
 * Intentionally does not rank or fuzzy-edit — this is a filter, not a
 * search-engine. The admin's book list rarely exceeds a few hundred
 * rows, so correctness + zero deps beat Fuse.js-grade accuracy.
 */

function normalize(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase();
}

function isSubsequence(query: string, target: string): boolean {
  let i = 0;
  for (const ch of target) {
    if (ch === query[i]) i++;
    if (i === query.length) return true;
  }
  return i === query.length;
}

export function fuzzyMatch(query: string, target: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  const t = normalize(target);
  if (t.includes(q)) return true;
  return isSubsequence(q, t);
}

export function fuzzyMatchAny(query: string, targets: (string | number | null | undefined)[]): boolean {
  const q = query.trim();
  if (!q) return true;
  return targets.some((t) => {
    if (t === null || t === undefined) return false;
    return fuzzyMatch(q, String(t));
  });
}

/**
 * Persistent playback positions for the chapter Read button.
 *
 * Saves `audio.currentTime` to localStorage on pause/stop/unmount and restores
 * it next time the user clicks Read on the same chapter. Per-(book, chapter).
 *
 * Backend audio cache (services/db.audio_cache) handles the *audio file*; this
 * module handles only the *playback position* — they're independent.
 */

const KEY_PREFIX = "audio_position";

function key(bookId: number, chapterIndex: number): string {
  return `${KEY_PREFIX}:${bookId}:${chapterIndex}`;
}

export function getAudioPosition(bookId: number, chapterIndex: number): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(key(bookId, chapterIndex));
    if (!raw) return 0;
    const t = Number(raw);
    return Number.isFinite(t) && t >= 0 ? t : 0;
  } catch {
    return 0;
  }
}

export function saveAudioPosition(
  bookId: number,
  chapterIndex: number,
  currentTime: number
): void {
  if (typeof window === "undefined") return;
  try {
    if (!Number.isFinite(currentTime) || currentTime < 0) return;
    localStorage.setItem(key(bookId, chapterIndex), String(currentTime));
  } catch {
    // ignore quota / private-mode errors
  }
}

export function clearAudioPosition(bookId: number, chapterIndex: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key(bookId, chapterIndex));
  } catch {
    // ignore
  }
}

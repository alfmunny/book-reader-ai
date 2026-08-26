"use client";

/**
 * A cover for a book that arrived without one.
 *
 * Drawn from the record rather than stored: a generated image goes stale the
 * moment a title is fixed, costs bytes, and blurs when scaled. This stays current
 * and sharp for free.
 *
 * The ground colour is derived from the book, deterministically. That is the part
 * that makes it a cover rather than a placeholder — a shelf of identical
 * rectangles cannot be scanned, and recognition is the whole job. Hues stay inside
 * the app's warm range so a shelf still reads as one set.
 */

/** Muted grounds spread around the wheel but kept low-saturation for parchment. */
const GROUNDS = [
  "#8C5A3C", // clay
  "#6B6F4A", // olive
  "#7A4F55", // plum
  "#4F6470", // slate blue
  "#8A6E3E", // ochre
  "#5C6B5A", // sage
  "#7B5470", // mauve
  "#46605C", // teal
];

/** Stable across renders and reloads — the same book always gets the same cover. */
function groundFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return GROUNDS[Math.abs(hash) % GROUNDS.length];
}

/** Long titles step down rather than truncate — a half-hidden title is worse. */
function titleSize(title: string): string {
  if (title.length > 46) return "text-[9px] leading-tight";
  if (title.length > 24) return "text-[11px] leading-snug";
  return "text-sm leading-snug";
}

interface Props {
  title: string;
  authors?: string[];
  /** Anything stable per book; the id is ideal. */
  seed?: string | number;
  className?: string;
}

export default function GeneratedCover({ title, authors, seed, className = "" }: Props) {
  const ground = groundFor(String(seed ?? title));
  const author = authors?.[0] ?? "";

  return (
    <div
      aria-hidden="true"
      className={`relative flex flex-col justify-end overflow-hidden rounded-md border border-black/10 ${className}`}
      style={{ background: ground, aspectRatio: "3 / 4" }}
    >
      {/* A paper band carrying the type — the ground stays a solid field. */}
      <div className="bg-[#FBF8F1] px-2 py-1.5 m-1.5 rounded-sm">
        <p className={`font-serif font-semibold text-[#241F1B] m-0 break-words ${titleSize(title)}`}>
          {title}
        </p>
        {author && (
          <p className="text-[8px] text-[#6B6156] m-0 mt-0.5 truncate">{author}</p>
        )}
      </div>
    </div>
  );
}

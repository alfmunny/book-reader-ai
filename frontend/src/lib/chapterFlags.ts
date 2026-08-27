/**
 * Chapter-level signals for auditing a split.
 *
 * Auditing is a search problem, not a reading problem: nobody reads 47 chapters
 * to check a split, they need to know where the damage is. These are hints about
 * where to look, never gates — every one of them has legitimate exceptions, so a
 * flagged chapter can still be perfectly correct.
 *
 * All computed from the text itself. No network, no model call.
 */

export interface ChapterLike {
  title: string;
  text: string;
}

export interface ChapterFlag {
  /** Short label for the rail. */
  key: string;
  /** Why it is flagged, shown when the chapter is open. */
  detail: string;
}

/** Below this a chapter is more likely a stray heading than a chapter. */
export const RUNT_CHARS = 400;
/** Above this multiple of the median, two chapters probably failed to separate. */
export const OVERSIZED_FACTOR = 3;

export function paragraphsOf(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

export function medianLength(chapters: ChapterLike[]): number {
  if (chapters.length === 0) return 0;
  const lengths = chapters.map((c) => c.text.length).sort((a, b) => a - b);
  return lengths[Math.floor(lengths.length / 2)];
}

/*
 * There was a fourth flag here — a per-chapter attempt at the verse-collapse
 * detector from #820, looking for an all-caps speaker cue buried in a long
 * paragraph. Measured against 805 frozen chapters it fired 10 times and was
 * wrong every time: all-caps chapter summaries in City of God, Hamlet's signed
 * letters, a publisher's advertisement page in Dracula, and the phrase "I O U"
 * in Crime and Punishment. Faust — the drama it was built for — never triggered
 * it, because Faust's split is correct.
 *
 * It cannot be tuned, because it has no baseline. The book-level detector in
 * epub_split_audit.py works by comparing the EPUB path's paragraph count against
 * the plain-text path's; collapse shows up as a ratio. A single chapter has
 * nothing to compare against, so it can only guess from surface features, and
 * uppercase text is far commoner in public-domain editions than collapsed drama.
 *
 * The flags below are structural facts rather than inferences, which is why they
 * do not have this problem. Run `python -m scripts.epub_split_audit` for the
 * collapse check.
 */

export function flagsFor(chapter: ChapterLike, median: number): ChapterFlag[] {
  const flags: ChapterFlag[] = [];
  const paras = paragraphsOf(chapter.text);

  if (!chapter.title.trim()) {
    flags.push({ key: "No title", detail: "The splitter found no heading for this chapter." });
  }
  if (chapter.text.length < RUNT_CHARS || paras.length < 2) {
    flags.push({
      key: "Runt",
      detail: "Very short — often a stray heading that became its own chapter.",
    });
  }
  if (median > 0 && chapter.text.length > median * OVERSIZED_FACTOR) {
    flags.push({
      key: "Oversized",
      detail: `More than ${OVERSIZED_FACTOR}× the median chapter. Two chapters may have failed to separate.`,
    });
  }
  return flags;
}

// ── bulk title tools ─────────────────────────────────────────────────────────

/** Leading ordinal a source often carries: "Chapter IV.", "3 —", "Kapitel 2:". */
const LEADING_ORDINAL = /^\s*(chapter|kapitel|chapitre|capitolo)?\s*[\dIVXLCivxlc]+\s*[.:—–-]?\s*/i;

export function stripLeadingOrdinal(title: string): string {
  return title.replace(LEADING_ORDINAL, "").trim();
}

/**
 * Number every chapter, keeping whatever name it already had. Strips any existing
 * ordinal first so running it twice does not produce "2. 1. Nacht".
 */
export function numberTitles(chapters: ChapterLike[]): string[] {
  return chapters.map((c, i) => {
    const bare = stripLeadingOrdinal(c.title);
    return bare ? `${i + 1}. ${bare}` : `${i + 1}.`;
  });
}

/** Fill only the empty titles from each chapter's first line. */
export function titlesFromFirstLine(chapters: ChapterLike[], maxLen = 60): string[] {
  return chapters.map((c) => {
    if (c.title.trim()) return c.title;
    const firstLine = (c.text.split("\n").find((l) => l.trim()) ?? "").trim();
    return firstLine.slice(0, maxLen).trim();
  });
}

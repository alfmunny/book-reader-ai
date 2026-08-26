import type { VocabularyWord, VocabularyOccurrence } from "@/lib/api";

/** Mirrors the vocabulary page's sort modes, so the file matches what's on screen. */
export type VocabGroupBy = "alpha" | "language" | "book" | "recent";

export interface VocabExportOptions {
  groupBy?: VocabGroupBy;
  /** Restrict to one book; omit for every book. */
  bookId?: number | null;
  /** Restrict to one language ("Unknown" for entries with none); omit for all. */
  language?: string | null;
}

interface Row {
  word: string;
  language: string;
  savedAt: string;
  occ: VocabularyOccurrence;
}

const UNKNOWN_LANGUAGE = "Unknown";

function bookTitleOf(occ: VocabularyOccurrence): string {
  return occ.book_title?.trim() || "(deleted book)";
}

function line(row: Row, withBook: boolean): string {
  const form = row.occ.surface_form && row.occ.surface_form !== row.word ? ` *(as ${row.occ.surface_form})*` : "";
  const where = withBook
    ? `${bookTitleOf(row.occ)}, Chapter ${row.occ.chapter_index + 1}`
    : `Chapter ${row.occ.chapter_index + 1}`;
  return `- **${row.word}**${form} — "${row.occ.sentence_text}" *(${where})*`;
}

function byWordThenChapter(a: Row, b: Row): number {
  return a.word.localeCompare(b.word) || a.occ.chapter_index - b.occ.chapter_index;
}

/** Render the saved vocabulary as a standalone markdown document. */
export function buildVocabularyMarkdown(
  words: VocabularyWord[],
  options: VocabExportOptions = {},
): string {
  const { groupBy = "book", bookId = null, language = null } = options;

  const scoped = words.filter(
    (w) => language === null || (w.language ?? UNKNOWN_LANGUAGE) === language,
  );

  const rows: Row[] = [];
  const wordless: string[] = [];
  for (const w of scoped) {
    const occs = w.occurrences.filter((o) => bookId === null || o.book_id === bookId);
    if (occs.length === 0) {
      // A word with no occurrence left after scoping is out; only an
      // unscoped word that never had one is worth listing on its own.
      if (bookId === null && w.occurrences.length === 0) wordless.push(w.word);
      continue;
    }
    for (const occ of occs) {
      rows.push({
        word: w.word,
        language: w.language ?? UNKNOWN_LANGUAGE,
        savedAt: w.created_at ?? "",
        occ,
      });
    }
  }

  const lines: string[] = ["# Vocabulary", ""];

  if (rows.length === 0 && wordless.length === 0) {
    lines.push("*No saved words yet.*", "");
    return lines.join("\n");
  }

  const wordCount = new Set(rows.map((r) => r.word)).size + wordless.length;
  const summary = [
    `${wordCount} word${wordCount === 1 ? "" : "s"}`,
    `${rows.length} occurrence${rows.length === 1 ? "" : "s"}`,
  ];
  if (bookId !== null) {
    summary.push(rows.length > 0 ? bookTitleOf(rows[0].occ) : "(deleted book)");
  }
  if (language !== null) summary.push(`language: ${language}`);
  lines.push(`*${summary.join(" · ")}*`, "");

  function section(heading: string, sectionRows: Row[], withBook: boolean) {
    if (heading) lines.push(`## ${heading}`, "");
    for (const row of sectionRows) lines.push(line(row, withBook));
    lines.push("");
  }

  if (groupBy === "recent") {
    // Newest first, matching the page's Recent sort.
    const sorted = [...rows].sort((a, b) => b.savedAt.localeCompare(a.savedAt) || byWordThenChapter(a, b));
    section("", sorted, true);
  } else {
    const buckets = new Map<string, Row[]>();
    for (const row of rows) {
      const key =
        groupBy === "book" ? bookTitleOf(row.occ)
        : groupBy === "language" ? row.language
        : row.word[0]?.toUpperCase() ?? "#";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(row);
    }
    const headings = Array.from(buckets.keys()).sort((a, b) => {
      if (groupBy === "language") {
        if (a === UNKNOWN_LANGUAGE) return 1;
        if (b === UNKNOWN_LANGUAGE) return -1;
      }
      return a.localeCompare(b);
    });
    for (const heading of headings) {
      section(heading, buckets.get(heading)!.sort(byWordThenChapter), groupBy !== "book");
    }
  }

  if (wordless.length > 0) {
    lines.push("## Unassigned", "");
    for (const w of wordless.sort((a, b) => a.localeCompare(b))) lines.push(`- **${w}**`);
    lines.push("");
  }

  return lines.join("\n");
}

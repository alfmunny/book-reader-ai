import type { VocabularyWord, VocabularyOccurrence } from "@/lib/api";

interface Row {
  word: string;
  occ: VocabularyOccurrence;
}

/** Render the saved vocabulary as a standalone markdown document, grouped by book. */
export function buildVocabularyMarkdown(words: VocabularyWord[]): string {
  const lines: string[] = ["# Vocabulary", ""];

  if (words.length === 0) {
    lines.push("*No saved words yet.*", "");
    return lines.join("\n");
  }

  const occCount = words.reduce((n, w) => n + w.occurrences.length, 0);
  lines.push(
    `*${words.length} word${words.length === 1 ? "" : "s"} · ${occCount} occurrence${occCount === 1 ? "" : "s"}*`,
    "",
  );

  const byBook = new Map<string, Row[]>();
  const unassigned: string[] = [];
  for (const w of words) {
    if (w.occurrences.length === 0) {
      unassigned.push(w.word);
      continue;
    }
    for (const occ of w.occurrences) {
      const title = occ.book_title?.trim() || "(deleted book)";
      if (!byBook.has(title)) byBook.set(title, []);
      byBook.get(title)!.push({ word: w.word, occ });
    }
  }

  for (const title of Array.from(byBook.keys()).sort((a, b) => a.localeCompare(b))) {
    lines.push(`## ${title}`, "");
    const rows = byBook
      .get(title)!
      .sort((a, b) => a.word.localeCompare(b.word) || a.occ.chapter_index - b.occ.chapter_index);
    for (const { word, occ } of rows) {
      const form = occ.surface_form && occ.surface_form !== word ? ` *(as ${occ.surface_form})*` : "";
      lines.push(`- **${word}**${form} — "${occ.sentence_text}" *(Chapter ${occ.chapter_index + 1})*`);
    }
    lines.push("");
  }

  if (unassigned.length > 0) {
    lines.push("## Unassigned", "");
    for (const w of unassigned.sort((a, b) => a.localeCompare(b))) lines.push(`- **${w}**`);
    lines.push("");
  }

  return lines.join("\n");
}

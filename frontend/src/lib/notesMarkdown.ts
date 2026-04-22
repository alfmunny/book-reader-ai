import type { Annotation, BookInsight, VocabularyWord, BookChapter, BookMeta } from "@/lib/api";

type ViewMode = "section" | "chapter";

export function chapterLabel(chapters: BookChapter[], idx: number): string {
  const t = chapters[idx]?.title?.trim();
  return t && t.toLowerCase() !== `chapter ${idx + 1}` ? t : `Chapter ${idx + 1}`;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function buildMarkdown(
  mode: ViewMode,
  meta: BookMeta,
  chapters: BookChapter[],
  annotations: Annotation[],
  insights: BookInsight[],
  vocab: VocabularyWord[],
  bookId: number,
): string {
  const lines: string[] = [];
  lines.push(`# ${meta.title}`);
  const author = (meta.authors ?? []).join(", ");
  if (author) lines.push(`*${author}*`);
  lines.push("");

  const bookVocab = vocab.filter((v) => v.occurrences.some((o) => o.book_id === bookId));

  const groupByChapter = <T,>(items: T[], getIdx: (t: T) => number) => {
    const map = new Map<number, T[]>();
    for (const item of items) {
      const k = getIdx(item);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  };

  if (mode === "section") {
    if (annotations.length > 0) {
      lines.push("## Annotations", "");
      for (const [ch, anns] of groupByChapter(annotations, (a) => a.chapter_index)) {
        lines.push(`### ${chapterLabel(chapters, ch)}`, "");
        for (const a of anns) {
          lines.push(`> "${a.sentence_text}"`, "");
          if (a.note_text) { lines.push(a.note_text, ""); }
        }
      }
    }
    if (insights.length > 0) {
      lines.push("## AI Insights", "");
      const bookLevel = insights.filter((i) => i.chapter_index === null);
      const byChapter = groupByChapter(insights.filter((i) => i.chapter_index !== null), (i) => i.chapter_index as number);
      if (bookLevel.length > 0) {
        lines.push("### Book-level", "");
        for (const i of bookLevel) {
          if (i.context_text) { lines.push(`> "${truncate(i.context_text, 200)}"`, ""); }
          lines.push(`**Q:** ${i.question}`, `**A:** ${i.answer}`, "");
        }
      }
      for (const [ch, ins] of byChapter) {
        lines.push(`### ${chapterLabel(chapters, ch)}`, "");
        for (const i of ins) {
          if (i.context_text) { lines.push(`> "${truncate(i.context_text, 200)}"`, ""); }
          lines.push(`**Q:** ${i.question}`, `**A:** ${i.answer}`, "");
        }
      }
    }
    if (bookVocab.length > 0) {
      lines.push("## Vocabulary", "");
      for (const v of bookVocab) {
        for (const o of v.occurrences.filter((o) => o.book_id === bookId)) {
          lines.push(`- **${v.word}** *(${chapterLabel(chapters, o.chapter_index)})* — "${truncate(o.sentence_text, 90)}"`);
        }
      }
      lines.push("");
    }
  } else {
    const chSet = new Set<number>();
    annotations.forEach((a) => chSet.add(a.chapter_index));
    insights.filter((i) => i.chapter_index !== null).forEach((i) => chSet.add(i.chapter_index as number));
    bookVocab.forEach((v) => v.occurrences.filter((o) => o.book_id === bookId).forEach((o) => chSet.add(o.chapter_index)));
    for (const ch of Array.from(chSet).sort((a, b) => a - b)) {
      lines.push(`## ${chapterLabel(chapters, ch)}`, "");
      for (const a of annotations.filter((a) => a.chapter_index === ch)) {
        lines.push(`> "${a.sentence_text}"`, "");
        if (a.note_text) { lines.push(a.note_text, ""); }
      }
      for (const i of insights.filter((i) => i.chapter_index === ch)) {
        if (i.context_text) { lines.push(`> "${truncate(i.context_text, 200)}"`, ""); }
        lines.push(`**Q:** ${i.question}`, `**A:** ${i.answer}`, "");
      }
      const chVoc = bookVocab.filter((v) => v.occurrences.some((o) => o.book_id === bookId && o.chapter_index === ch));
      if (chVoc.length > 0) {
        lines.push("**Words:**");
        for (const v of chVoc) {
          const occ = v.occurrences.find((o) => o.book_id === bookId && o.chapter_index === ch);
          if (occ) lines.push(`- **${v.word}** — "${truncate(occ.sentence_text, 70)}"`);
        }
        lines.push("");
      }
    }
    const bookLevelInsights = insights.filter((i) => i.chapter_index === null);
    if (bookLevelInsights.length > 0) {
      lines.push("## Book-level Insights", "");
      for (const i of bookLevelInsights) {
        if (i.context_text) { lines.push(`> "${truncate(i.context_text, 200)}"`, ""); }
        lines.push(`**Q:** ${i.question}`, `**A:** ${i.answer}`, "");
      }
    }
  }
  return lines.join("\n") + "\n";
}

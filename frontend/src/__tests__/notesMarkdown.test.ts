/**
 * notesMarkdown.ts — unit tests for buildMarkdown and helpers.
 * Covers uncovered branches: lines 25, 35, 59, 89-92, 100, 109.
 */
import { buildMarkdown, chapterLabel, truncate } from "@/lib/notesMarkdown";
import type { Annotation, BookInsight, VocabularyWord, BookChapter, BookMeta } from "@/lib/api";

const CHAPTERS: BookChapter[] = [
  { title: "Chapter 1", text: "" },
  { title: "Chapter 2", text: "" },
];

function meta(overrides?: Partial<BookMeta>): BookMeta {
  return {
    id: 1, title: "Test Book", authors: ["Author A"],
    languages: ["en"], subjects: [], download_count: 0, cover: null,
    ...overrides,
  };
}

function ann(overrides?: Partial<Annotation>): Annotation {
  return {
    id: 1, book_id: 1, chapter_index: 0, sentence_text: "A sentence.",
    note_text: "", color: "yellow", ...overrides,
  };
}

function insight(overrides?: Partial<BookInsight>): BookInsight {
  return {
    id: 1, book_id: 1, chapter_index: 0, question: "Q?", answer: "A.",
    context_text: null, created_at: "2026-01-01", ...overrides,
  };
}

function vocab(overrides?: Partial<VocabularyWord>): VocabularyWord {
  return {
    id: 1, word: "ephemeral", lemma: "ephemeral", language: "en",
    occurrences: [{ book_id: 1, book_title: "Test Book", chapter_index: 0, sentence_text: "Ephemeral." }],
    ...overrides,
  };
}

// ── chapterLabel / truncate ───────────────────────────────────────────────────

test("chapterLabel returns title when it differs from default", () => {
  expect(chapterLabel(CHAPTERS, 0)).toBe("Chapter 1");
});

test("chapterLabel returns Chapter N when title matches default", () => {
  const chs: BookChapter[] = [{ title: "chapter 1", text: "" }];
  expect(chapterLabel(chs, 0)).toBe("Chapter 1");
});

test("truncate shortens long strings", () => {
  expect(truncate("hello world", 5)).toBe("hell…");
  expect(truncate("short", 10)).toBe("short");
});

// ── Line 25: meta.authors ?? [] fallback ─────────────────────────────────────

test("buildMarkdown does not add author line when authors is undefined (line 25)", () => {
  const m = meta({ authors: undefined });
  const md = buildMarkdown("section", m, CHAPTERS, [], [], [], 1);
  expect(md).not.toContain("*");
});

test("buildMarkdown does not add author line when authors is null (line 25)", () => {
  const m = meta({ authors: null as unknown as string[] });
  const md = buildMarkdown("section", m, CHAPTERS, [], [], [], 1);
  expect(md).not.toContain("*");
});

// ── Line 35: groupByChapter false branch (multiple items same chapter) ───────

test("groupByChapter second item in same chapter uses existing map entry (line 35)", () => {
  const anns = [
    ann({ id: 1, chapter_index: 0, sentence_text: "First." }),
    ann({ id: 2, chapter_index: 0, sentence_text: "Second." }),
  ];
  const md = buildMarkdown("section", meta(), CHAPTERS, anns, [], [], 1);
  expect(md).toContain("First.");
  expect(md).toContain("Second.");
});

// ── Line 59: book-level insight with context_text in section mode ─────────────

test("section mode: book-level insight with context_text outputs quote (line 59)", () => {
  const ins = insight({ chapter_index: null, context_text: "The context.", question: "Why?", answer: "Because." });
  const md = buildMarkdown("section", meta(), CHAPTERS, [], [ins], [], 1);
  expect(md).toContain('"The context."');
  expect(md).toContain("**Q:** Why?");
});

// ── Lines 89-92: chapter mode with note_text and context_text ─────────────────

test("chapter mode: annotation with note_text outputs note (line 89)", () => {
  const a = ann({ note_text: "My note here.", chapter_index: 0 });
  const md = buildMarkdown("chapter", meta(), CHAPTERS, [a], [], [], 1);
  expect(md).toContain("My note here.");
});

test("chapter mode: chapter insight with context_text outputs quote (lines 91-92)", () => {
  const i = insight({ chapter_index: 0, context_text: "Chapter context.", question: "What?", answer: "This." });
  const md = buildMarkdown("chapter", meta(), CHAPTERS, [], [i], [], 1);
  expect(md).toContain('"Chapter context."');
  expect(md).toContain("**Q:** What?");
});

// ── Line 100: chapter mode vocab occurrence found ─────────────────────────────

test("chapter mode: vocab word with matching occurrence outputs word (line 100)", () => {
  const v = vocab();
  const md = buildMarkdown("chapter", meta(), CHAPTERS, [], [], [v], 1);
  expect(md).toContain("**ephemeral**");
  expect(md).toContain("Ephemeral.");
});

// ── Line 109: chapter mode book-level insight with context_text ───────────────

test("chapter mode: book-level insight with context_text outputs quote (line 109)", () => {
  const i = insight({ chapter_index: null, context_text: "Book-level context.", question: "Overall?", answer: "Yes." });
  const md = buildMarkdown("chapter", meta(), CHAPTERS, [], [i], [], 1);
  expect(md).toContain('"Book-level context."');
  expect(md).toContain("## Book-level Insights");
});

// ── Additional branches ───────────────────────────────────────────────────────

test("section mode: annotation note_text produces additional line", () => {
  const a = ann({ note_text: "Annotation note.", chapter_index: 0 });
  const md = buildMarkdown("section", meta(), CHAPTERS, [a], [], [], 1);
  expect(md).toContain("Annotation note.");
});

test("section mode: vocab words output in section", () => {
  const v = vocab();
  const md = buildMarkdown("section", meta(), CHAPTERS, [], [], [v], 1);
  expect(md).toContain("## Vocabulary");
  expect(md).toContain("**ephemeral**");
});

test("chapter mode: annotation without note_text does not add extra lines", () => {
  const a = ann({ note_text: "", chapter_index: 0 });
  const md = buildMarkdown("chapter", meta(), CHAPTERS, [a], [], [], 1);
  expect(md).toContain("A sentence.");
});

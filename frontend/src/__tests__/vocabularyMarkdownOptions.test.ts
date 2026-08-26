/**
 * buildVocabularyMarkdown grouping + scope options — the export dialog lets the
 * reader pick A–Z / Language / Book / Recent, and narrow to one book or one
 * language.
 */
import { buildVocabularyMarkdown } from "@/lib/vocabularyMarkdown";
import type { VocabularyWord } from "@/lib/api";

const MOBY = { book_id: 10, book_title: "Moby Dick" };
const FAUST = { book_id: 20, book_title: "Faust" };

function word(
  id: number,
  w: string,
  opts: { language?: string | null; savedAt?: string; occ?: Array<{ book: typeof MOBY; ch: number; text: string }> } = {},
): VocabularyWord {
  return {
    id,
    word: w,
    // `in` rather than ??, so an explicit null language survives.
    language: "language" in opts ? opts.language : "en",
    created_at: opts.savedAt ?? "2026-01-01T00:00:00",
    occurrences: (opts.occ ?? [{ book: MOBY, ch: 0, text: `A sentence with ${w}.` }]).map((o) => ({
      book_id: o.book.book_id,
      book_title: o.book.book_title,
      chapter_index: o.ch,
      sentence_text: o.text,
    })),
  } as VocabularyWord;
}

const WORDS = [
  word(1, "zephyr", { savedAt: "2026-03-01T00:00:00" }),
  word(2, "abate", { savedAt: "2026-01-15T00:00:00" }),
  word(3, "verhöhnen", {
    language: "de",
    savedAt: "2026-02-01T00:00:00",
    occ: [{ book: FAUST as typeof MOBY, ch: 4, text: "Er wurde verhöhnt." }],
  }),
];

describe("group by A–Z", () => {
  it("puts each word under its initial letter, in order", () => {
    const md = buildVocabularyMarkdown(WORDS, { groupBy: "alpha" });
    expect(md).toContain("## A");
    expect(md).toContain("## Z");
    expect(md.indexOf("## A")).toBeLessThan(md.indexOf("## Z"));
  });

  it("names the book on each line, since sections are not books here", () => {
    const md = buildVocabularyMarkdown(WORDS, { groupBy: "alpha" });
    expect(md).toContain('- **abate** — "A sentence with abate." *(Moby Dick, Chapter 1)*');
  });
});

describe("group by language", () => {
  it("makes one section per language", () => {
    const md = buildVocabularyMarkdown(WORDS, { groupBy: "language" });
    expect(md).toContain("## de");
    expect(md).toContain("## en");
  });

  it("files words with no language under Unknown", () => {
    const md = buildVocabularyMarkdown([word(9, "orphan", { language: null })], { groupBy: "language" });
    expect(md).toContain("## Unknown");
  });
});

describe("group by recent", () => {
  it("lists newest first with no section headings", () => {
    const md = buildVocabularyMarkdown(WORDS, { groupBy: "recent" });
    expect(md).not.toContain("## ");
    expect(md.indexOf("**zephyr**")).toBeLessThan(md.indexOf("**verhöhnen**"));
    expect(md.indexOf("**verhöhnen**")).toBeLessThan(md.indexOf("**abate**"));
  });
});

describe("group by book", () => {
  it("stays the default when no grouping is given", () => {
    const md = buildVocabularyMarkdown(WORDS);
    expect(md).toContain("## Moby Dick");
    expect(md).toContain("## Faust");
  });

  it("omits the book name from the line, because the section already says it", () => {
    const md = buildVocabularyMarkdown(WORDS, { groupBy: "book" });
    expect(md).toContain('- **abate** — "A sentence with abate." *(Chapter 1)*');
  });
});

describe("scope: one book", () => {
  it("keeps only that book's occurrences", () => {
    const md = buildVocabularyMarkdown(WORDS, { groupBy: "alpha", bookId: 20 });
    expect(md).toContain("**verhöhnen**");
    expect(md).not.toContain("**abate**");
    expect(md).not.toContain("**zephyr**");
  });

  it("names the scope in the summary line", () => {
    const md = buildVocabularyMarkdown(WORDS, { groupBy: "alpha", bookId: 20 });
    expect(md).toContain("Faust");
    expect(md).toContain("1 word · 1 occurrence");
  });

  it("drops a word entirely when it has no occurrence in that book", () => {
    const md = buildVocabularyMarkdown(WORDS, { groupBy: "book", bookId: 10 });
    expect(md).not.toContain("Faust");
  });
});

describe("scope: one language", () => {
  it("keeps only words in that language", () => {
    const md = buildVocabularyMarkdown(WORDS, { groupBy: "alpha", language: "de" });
    expect(md).toContain("**verhöhnen**");
    expect(md).not.toContain("**abate**");
  });

  it("names the language in the summary line", () => {
    const md = buildVocabularyMarkdown(WORDS, { groupBy: "alpha", language: "de" });
    expect(md).toContain("language: de");
  });
});

describe("book and language together", () => {
  it("applies both filters", () => {
    const md = buildVocabularyMarkdown(WORDS, { groupBy: "alpha", bookId: 20, language: "en" });
    expect(md).toContain("*No saved words yet.*");
  });
});

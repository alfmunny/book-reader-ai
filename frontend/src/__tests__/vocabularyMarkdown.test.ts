/**
 * lib/vocabularyMarkdown.ts — markdown export of the vocabulary list (#2703).
 */
import { buildVocabularyMarkdown } from "@/lib/vocabularyMarkdown";
import type { VocabularyWord } from "@/lib/api";

function word(overrides: Partial<VocabularyWord> = {}): VocabularyWord {
  return {
    id: 1,
    word: "ephemeral",
    occurrences: [
      { book_id: 10, book_title: "Moby Dick", chapter_index: 2, sentence_text: "The ephemeral whale loomed." },
    ],
    ...overrides,
  };
}

test("starts with a heading and a word/occurrence count", () => {
  const md = buildVocabularyMarkdown([word()]);
  expect(md).toContain("# Vocabulary");
  expect(md).toContain("*1 word · 1 occurrence*");
});

test("pluralises the counts", () => {
  const md = buildVocabularyMarkdown([
    word(),
    word({
      id: 2,
      word: "ardent",
      occurrences: [
        { book_id: 10, book_title: "Moby Dick", chapter_index: 5, sentence_text: "His ardent gaze." },
        { book_id: 11, book_title: "Emma", chapter_index: 0, sentence_text: "An ardent admirer." },
      ],
    }),
  ]);
  expect(md).toContain("*2 words · 3 occurrences*");
});

test("groups occurrences under a heading per book, alphabetically", () => {
  const md = buildVocabularyMarkdown([
    word({
      occurrences: [
        { book_id: 10, book_title: "Moby Dick", chapter_index: 2, sentence_text: "The ephemeral whale." },
        { book_id: 11, book_title: "Emma", chapter_index: 0, sentence_text: "An ephemeral hope." },
      ],
    }),
  ]);
  expect(md.indexOf("## Emma")).toBeGreaterThan(-1);
  expect(md.indexOf("## Emma")).toBeLessThan(md.indexOf("## Moby Dick"));
});

test("renders the word, sentence and 1-based chapter number", () => {
  const md = buildVocabularyMarkdown([word()]);
  expect(md).toContain('- **ephemeral** — "The ephemeral whale loomed." *(Chapter 3)*');
});

test("notes the surface form when it differs from the saved word", () => {
  const md = buildVocabularyMarkdown([
    word({
      word: "verhöhnen",
      occurrences: [
        {
          book_id: 12, book_title: "Faust", chapter_index: 0,
          sentence_text: "Er wurde verhöhnt.", surface_form: "verhöhnt",
        },
      ],
    }),
  ]);
  expect(md).toContain('- **verhöhnen** *(as verhöhnt)* — "Er wurde verhöhnt." *(Chapter 1)*');
});

test("omits the surface form when it matches the saved word", () => {
  const md = buildVocabularyMarkdown([
    word({
      occurrences: [
        {
          book_id: 10, book_title: "Moby Dick", chapter_index: 0,
          sentence_text: "The ephemeral whale.", surface_form: "ephemeral",
        },
      ],
    }),
  ]);
  expect(md).not.toContain("(as ephemeral)");
});

test("sorts words alphabetically within a book", () => {
  const md = buildVocabularyMarkdown([
    word({ id: 1, word: "zephyr" }),
    word({ id: 2, word: "aback", occurrences: [{ book_id: 10, book_title: "Moby Dick", chapter_index: 0, sentence_text: "Taken aback." }] }),
  ]);
  expect(md.indexOf("**aback**")).toBeLessThan(md.indexOf("**zephyr**"));
});

test("lists words that have no occurrences under their own heading", () => {
  const md = buildVocabularyMarkdown([word({ id: 3, word: "orphan", occurrences: [] })]);
  expect(md).toContain("## Unassigned");
  expect(md).toContain("- **orphan**");
});

test("falls back to a placeholder title for occurrences from a deleted book", () => {
  const md = buildVocabularyMarkdown([
    word({ occurrences: [{ book_id: 99, book_title: "", chapter_index: 0, sentence_text: "Orphaned." }] }),
  ]);
  expect(md).toContain("## (deleted book)");
});

test("renders an explicit empty state for an empty vocabulary", () => {
  const md = buildVocabularyMarkdown([]);
  expect(md).toContain("# Vocabulary");
  expect(md).toContain("*No saved words yet.*");
});

test("ends with a trailing newline", () => {
  expect(buildVocabularyMarkdown([word()]).endsWith("\n")).toBe(true);
});

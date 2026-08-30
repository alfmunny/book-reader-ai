/**
 * Regression tests for #2565:
 * - VocabWordTooltip dialog missing aria-describedby
 * - WordLookup dialog missing aria-describedby
 * - WordActionDrawer dialog missing aria-describedby
 * - Decks add-word picker dialog missing aria-describedby
 * - Reader chat sheet dialog missing aria-describedby
 */
import * as fs from "fs";
import * as path from "path";

const vocabTooltipSrc = fs.readFileSync(
  path.join(__dirname, "../components/VocabWordTooltip.tsx"),
  "utf8",
);

const wordLookupSrc = fs.readFileSync(
  path.join(__dirname, "../components/WordLookup.tsx"),
  "utf8",
);

const wordActionDrawerSrc = fs.readFileSync(
  path.join(__dirname, "../components/WordActionDrawer.tsx"),
  "utf8",
);

const deckPageSrc = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/decks/[deckId]/page.tsx"),
  "utf8",
);

const readerPageSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("role=dialog elements have aria-describedby (closes #2565)", () => {
  describe("VocabWordTooltip", () => {
    it("dialog has aria-describedby", () => {
      expect(vocabTooltipSrc).toContain('aria-describedby="vocab-tooltip-desc"');
    });

    it("description element has matching id", () => {
      expect(vocabTooltipSrc).toContain('id="vocab-tooltip-desc"');
    });
  });

  describe("WordLookup", () => {
    it("dialog has aria-describedby referencing a useId-generated id", () => {
      expect(wordLookupSrc).toContain("aria-describedby={descId}");
    });

    it("uses useId to generate description id", () => {
      expect(wordLookupSrc).toContain("useId");
    });

    it("description element has id={descId}", () => {
      expect(wordLookupSrc).toContain("id={descId}");
    });
  });

  describe("WordActionDrawer", () => {
    it("dialog has aria-describedby referencing a useId-generated id", () => {
      expect(wordActionDrawerSrc).toContain("aria-describedby={descId}");
    });

    it("uses useId to generate description id", () => {
      expect(wordActionDrawerSrc).toContain("useId");
    });

    it("description element has id={descId}", () => {
      expect(wordActionDrawerSrc).toContain("id={descId}");
    });
  });

  describe("Decks add-word picker", () => {
    it("dialog has aria-describedby", () => {
      expect(deckPageSrc).toContain('aria-describedby="add-word-picker-desc"');
    });

    it("description element has matching id", () => {
      expect(deckPageSrc).toContain('id="add-word-picker-desc"');
    });
  });

  describe("Reader chat sheet", () => {
    it("chat sheet dialog has aria-describedby", () => {
      expect(readerPageSrc).toContain('aria-describedby="reader-chat-desc"');
    });

    it("description element has matching id", () => {
      expect(readerPageSrc).toContain('id="reader-chat-desc"');
    });
  });
});

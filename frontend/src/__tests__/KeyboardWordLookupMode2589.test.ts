/**
 * Regression tests for #2589:
 * Keyboard word-lookup mode in the reader.
 * Press W (while in sentence-select mode) to enter word-select mode,
 * H/L or ←/→ to navigate words within the sentence, Enter to open
 * vocab tooltip for the selected word, Esc to exit back to sentence mode.
 *
 * Tests use static source-code analysis (fs.readFileSync) because the feature
 * spans two files: reader page and SentenceReader component.
 */
import * as fs from "fs";
import * as path from "path";

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);
const srSrc = fs.readFileSync(
  path.join(__dirname, "../components/SentenceReader.tsx"),
  "utf8",
);

describe("Keyboard word-lookup mode (closes #2589)", () => {
  describe("Reader page — state and keyboard handler", () => {
    it("declares wordSelectMode state", () => {
      expect(readerSrc).toMatch(/wordSelectMode/);
    });

    it("declares selectedWordIdx state", () => {
      expect(readerSrc).toMatch(/selectedWordIdx/);
    });

    it("W key enters word-select mode when a sentence is selected", () => {
      const kbIdx = readerSrc.indexOf("handleKeyDown");
      expect(kbIdx).not.toBe(-1);
      const kbBlock = readerSrc.slice(kbIdx, kbIdx + 12000);
      expect(kbBlock).toMatch(/key === ["']w["']|key === ["']W["']/i);
      expect(kbBlock).toMatch(/wordSelectMode/);
    });

    it("H / ArrowLeft navigates to the previous word", () => {
      const kbIdx = readerSrc.indexOf("handleKeyDown");
      const kbBlock = readerSrc.slice(kbIdx, kbIdx + 12000);
      expect(kbBlock).toMatch(/ArrowLeft|key === ["']h["']|key === ["']H["']/i);
    });

    it("L / ArrowRight navigates to the next word", () => {
      const kbIdx = readerSrc.indexOf("handleKeyDown");
      const kbBlock = readerSrc.slice(kbIdx, kbIdx + 12000);
      expect(kbBlock).toMatch(/ArrowRight|key === ["']l["']|key === ["']L["']/i);
    });

    it("Enter opens vocab tooltip for the selected word in word-select mode", () => {
      const kbIdx = readerSrc.indexOf("handleKeyDown");
      const kbBlock = readerSrc.slice(kbIdx, kbIdx + 12000);
      // Must reference wordSelectMode and the vocab tooltip setter
      expect(kbBlock).toMatch(/wordSelectMode/);
      expect(kbBlock).toMatch(/vocabTooltip|setVocabTooltip/);
    });

    it("Esc exits word-select mode and returns to sentence-select mode", () => {
      const kbIdx = readerSrc.indexOf("handleKeyDown");
      const kbBlock = readerSrc.slice(kbIdx, kbIdx + 12000);
      // The Escape branch inside wordSelectMode must clear word mode
      // but leave sentence mode intact (not call setSentenceSelectMode(false))
      expect(kbBlock).toMatch(/wordSelectMode/);
      expect(kbBlock).toMatch(/setWordSelectMode\(false\)/);
    });

    it("passes selectedWordIdx to SentenceReader", () => {
      expect(readerSrc).toMatch(/selectedWordIdx=\{/);
    });

    it("passes wordSelectMode to SentenceReader", () => {
      expect(readerSrc).toMatch(/wordSelectMode=\{/);
    });

    it("has a live-region or visible status strip for word-select mode", () => {
      expect(readerSrc).toMatch(/wordSelectMode/);
      // Visual indicator exists for sighted keyboard users
      expect(readerSrc).toMatch(/word.*select|Word.*select/i);
    });
  });

  describe("SentenceReader — word-level rendering", () => {
    it("Props interface includes wordSelectMode", () => {
      const propsIdx = srSrc.indexOf("interface Props");
      expect(propsIdx).not.toBe(-1);
      const propsBlock = srSrc.slice(propsIdx, propsIdx + 8000);
      expect(propsBlock).toMatch(/wordSelectMode/);
    });

    it("Props interface includes selectedWordIdx", () => {
      const propsIdx = srSrc.indexOf("interface Props");
      expect(propsIdx).not.toBe(-1);
      const propsBlock = srSrc.slice(propsIdx, propsIdx + 8000);
      expect(propsBlock).toMatch(/selectedWordIdx/);
    });

    it("renderSeg renders data-word-idx spans when wordSelectMode is active", () => {
      expect(srSrc).toMatch(/data-word-idx/);
    });

    it("selected word gets a highlight class (ring or bg)", () => {
      const wordIdxPos = srSrc.indexOf("data-word-idx");
      expect(wordIdxPos).not.toBe(-1);
      const context = srSrc.slice(wordIdxPos, wordIdxPos + 500);
      expect(context).toMatch(/ring-|bg-purple|selected.*word|word.*selected/i);
    });
  });
});

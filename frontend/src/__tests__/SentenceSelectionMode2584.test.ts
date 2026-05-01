/**
 * Regression test for #2584:
 * Keyboard sentence-selection mode for the reader.
 * Press N to enter mode, ↑/↓/J/K to navigate sentences, Enter to annotate,
 * Esc to exit. A live-region status indicator announces the active mode.
 *
 * Tests use static source-code analysis (fs.readFileSync) because the feature
 * is implemented across two files: reader page and SentenceReader component.
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

describe("Sentence-selection keyboard mode (closes #2584)", () => {
  describe("Reader page — state and keyboard handler", () => {
    it("declares sentenceSelectMode state", () => {
      expect(readerSrc).toMatch(/sentenceSelectMode/);
    });

    it("declares selectedSentenceFlatIdx state", () => {
      expect(readerSrc).toMatch(/selectedSentenceFlatIdx/);
    });

    it("N key enters sentence-selection mode", () => {
      const kbIdx = readerSrc.indexOf("handleKeyDown");
      expect(kbIdx).not.toBe(-1);
      const kbBlock = readerSrc.slice(kbIdx, kbIdx + 8000);
      expect(kbBlock).toMatch(/key === ["']n["']|key === ["']N["']/i);
      expect(kbBlock).toMatch(/sentenceSelectMode/);
    });

    it("ArrowUp/ArrowDown navigate sentences in selection mode", () => {
      const kbIdx = readerSrc.indexOf("handleKeyDown");
      const kbBlock = readerSrc.slice(kbIdx, kbIdx + 8000);
      expect(kbBlock).toMatch(/ArrowUp|ArrowDown/);
    });

    it("J/K keys also navigate sentences in selection mode", () => {
      const kbIdx = readerSrc.indexOf("handleKeyDown");
      const kbBlock = readerSrc.slice(kbIdx, kbIdx + 8000);
      expect(kbBlock).toMatch(/key === ["']j["']|key === ["']J["']|key === ["']k["']|key === ["']K["']/i);
    });

    it("Enter key triggers annotation in selection mode", () => {
      const kbIdx = readerSrc.indexOf("handleKeyDown");
      const kbBlock = readerSrc.slice(kbIdx, kbIdx + 8000);
      expect(kbBlock).toMatch(/Enter/);
      expect(kbBlock).toMatch(/sentenceSelectMode/);
    });

    it("Esc key exits sentence-selection mode and restores focus to reader scroll (WCAG 2.4.3 / closes #2587)", () => {
      const kbIdx = readerSrc.indexOf("handleKeyDown");
      const kbBlock = readerSrc.slice(kbIdx, kbIdx + 8000);
      expect(kbBlock).toMatch(/Escape/);
      expect(kbBlock).toMatch(/sentenceSelectMode/);
      // Must restore focus to reader-scroll on Esc so keyboard users don't lose their place
      expect(kbBlock).toMatch(/reader-scroll.*focus\(\)|focus\(\).*reader-scroll/);
    });

    it("N-key toggle-off also restores focus to reader scroll (WCAG 2.4.3)", () => {
      const kbIdx = readerSrc.indexOf("handleKeyDown");
      const kbBlock = readerSrc.slice(kbIdx, kbIdx + 8000);
      // The N-key toggle-off path must also call .focus() after clearing the mode
      const nKeyIdx = kbBlock.indexOf('"n" || e.key === "N"');
      expect(nKeyIdx).not.toBe(-1);
      const nKeyBlock = kbBlock.slice(nKeyIdx, nKeyIdx + 500);
      expect(nKeyBlock).toMatch(/setSentenceSelectMode\(false\)/);
      expect(nKeyBlock).toMatch(/focus\(\)/);
    });

    it("passes selectedSentenceFlatIdx to SentenceReader", () => {
      expect(readerSrc).toMatch(/selectedSentenceFlatIdx=\{/);
    });

    it("has a live-region status indicator for sentence-selection mode", () => {
      // WCAG 4.1.3: screen readers must be informed when mode changes
      expect(readerSrc).toMatch(/aria-live|role="status"/);
      expect(readerSrc).toMatch(/[Ss]entence.{0,30}[Mm]ode|[Ss]election.{0,30}[Mm]ode/);
    });
  });

  describe("SentenceReader — selectedSentenceFlatIdx prop + visual highlight", () => {
    it("Props interface includes selectedSentenceFlatIdx", () => {
      const propsIdx = srSrc.indexOf("interface Props");
      expect(propsIdx).not.toBe(-1);
      const propsBlock = srSrc.slice(propsIdx, propsIdx + 8000);
      expect(propsBlock).toMatch(/selectedSentenceFlatIdx/);
    });

    it("renderSeg applies a selection ring/highlight class when segment is selected", () => {
      const renderIdx = srSrc.indexOf("const renderSeg");
      expect(renderIdx).not.toBe(-1);
      const renderBlock = srSrc.slice(renderIdx, renderIdx + 3000);
      expect(renderBlock).toMatch(/selectedSentenceFlatIdx/);
      // Must apply some visible ring or outline class
      expect(renderBlock).toMatch(/ring-|outline-|selected/);
    });
  });
});

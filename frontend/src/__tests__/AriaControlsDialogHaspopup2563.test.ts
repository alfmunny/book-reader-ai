/**
 * Regression tests for #2563:
 * - SentenceReader note-dot button missing aria-controls + note card missing id
 * - InsightChat ContextChip "more/less" toggle missing aria-controls
 * - AnnotationsSidebar toggle button missing aria-haspopup="dialog"
 */
import * as fs from "fs";
import * as path from "path";

const sentenceReaderSrc = fs.readFileSync(
  path.join(__dirname, "../components/SentenceReader.tsx"),
  "utf8",
);

const insightChatSrc = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8",
);

const annotationsSidebarSrc = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8",
);

describe("aria-controls and aria-haspopup for disclosure/dialog triggers (closes #2563)", () => {
  // (SentenceReader note-dot removed 2026-08-21 — notes display in
  // QuickHighlightPanel; its note block is plain text, not a disclosure)

  describe("InsightChat ContextChip toggle", () => {
    it("ContextChip toggle button has aria-controls", () => {
      expect(insightChatSrc).toContain('aria-controls={ctxId}');
    });

    it("ContextChip text span has dynamic id for aria-controls", () => {
      expect(insightChatSrc).toContain('id={ctxId}');
    });

    it("ContextChip uses useId to generate stable id", () => {
      expect(insightChatSrc).toContain('useId');
    });
  });

  describe("AnnotationsSidebar toggle button", () => {
    it("toggle button has aria-haspopup=dialog", () => {
      expect(annotationsSidebarSrc).toContain('aria-haspopup="dialog"');
    });

    it("aria-haspopup appears near aria-expanded={open}", () => {
      const idx = annotationsSidebarSrc.indexOf("aria-expanded={open}");
      expect(idx).not.toBe(-1);
      const context = annotationsSidebarSrc.slice(Math.max(0, idx - 100), idx + 100);
      expect(context).toContain('aria-haspopup="dialog"');
    });
  });
});

/**
 * Regression tests for #2521:
 * InsightChat message log and ChapterSummary body are scrollable, display-only
 * containers. Both must have tabIndex={0} so keyboard users can scroll
 * AI-generated content (WCAG 2.1.1 Keyboard, Level A).
 */
import fs from "fs";
import path from "path";

const insightChatSrc = fs.readFileSync(
  path.resolve(__dirname, "../components/InsightChat.tsx"),
  "utf-8",
);

const chapterSummarySrc = fs.readFileSync(
  path.resolve(__dirname, "../components/ChapterSummary.tsx"),
  "utf-8",
);

describe("AI panel scroll containers — WCAG 2.1.1 (closes #2521)", () => {
  it("InsightChat message log has tabIndex={0}", () => {
    // role="log" messages container must have tabIndex={0}
    const regex =
      /role="log"[^>]*tabIndex=\{0\}|tabIndex=\{0\}[^>]*role="log"/;
    expect(insightChatSrc).toMatch(regex);
  });

  it("ChapterSummary body has tabIndex={0}", () => {
    // The flex-1 overflow-y-auto summary body must have tabIndex={0}
    const regex =
      /flex-1 overflow-y-auto[^"]*"[^>]*tabIndex=\{0\}|tabIndex=\{0\}[^>]*flex-1 overflow-y-auto/;
    expect(chapterSummarySrc).toMatch(regex);
  });
});

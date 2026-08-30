/**
 * Regression tests for #2204: focus-visible rings on AuthPromptModal sign-in
 * link and notes page InsightRow chapter reader link (WCAG 2.4.7).
 */
import * as fs from "fs";
import * as path from "path";

const authSrc = fs.readFileSync(
  path.join(__dirname, "../components/AuthPromptModal.tsx"),
  "utf8"
);
const notesSrc = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"),
  "utf8"
);

describe("AuthPromptModal anchor focus ring (closes #2204)", () => {
  it("Sign in link has focus-visible ring", () => {
    const idx = authSrc.indexOf("/api/auth/signin");
    expect(idx).toBeGreaterThan(-1);
    const window = authSrc.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-2");
  });
});

describe("Notes page InsightRow chapter link focus ring (closes #2204)", () => {
  it("Chapter reader link has focus-visible ring", () => {
    // Unique anchor: only the InsightRow link uses encodeURIComponent(ann.sentence_text)
    const idx = notesSrc.indexOf("encodeURIComponent(ann.sentence_text)");
    expect(idx).toBeGreaterThan(-1);
    const window = notesSrc.slice(idx, idx + 320);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

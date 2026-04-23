/**
 * Verifies that reader page interactive elements meet the 44px touch-target requirement.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("Reader page touch targets", () => {
  it("focus mode Prev chapter button has min-h-[44px]", () => {
    expect(src).toMatch(/goToChapter\(chapterIndex - 1\)[\s\S]{0,200}min-h-\[44px\]/);
  });

  it("focus mode Next chapter button has min-h-[44px]", () => {
    expect(src).toMatch(/goToChapter\(chapterIndex \+ 1\)[\s\S]{0,200}min-h-\[44px\]/);
  });

  it("focus mode Read paragraph button has min-h-[44px]", () => {
    expect(src).toMatch(/readFocusedParagraph[\s\S]{0,200}min-h-\[44px\]/);
  });

  it("focus mode typography Aa button has min-h-[44px]", () => {
    expect(src).toMatch(/setShowTypographyPanel[\s\S]{0,300}min-h-\[44px\]/);
  });

  it("focus mode exit button has min-h-[44px]", () => {
    expect(src).toMatch(/setFocusMode\(false\)[\s\S]{0,200}min-h-\[44px\]/);
  });

  it("Sign in link has min-h-[44px]", () => {
    expect(src).toMatch(/\/api\/auth\/signin[\s\S]{0,300}min-h-\[44px\]/);
  });

  it("notes view filter buttons have min-h-[44px]", () => {
    // min-h-[44px] appears before notesView in the className template literal
    expect(src).toMatch(/min-h-\[44px\][\s\S]{0,100}notesView === v/);
  });

  it("vocab view filter buttons have min-h-[44px]", () => {
    // min-h-[44px] appears before vocabView in the className template literal
    expect(src).toMatch(/min-h-\[44px\][\s\S]{0,100}vocabView === v/);
  });

  it("vocab occurrence list buttons have min-h-[44px]", () => {
    expect(src).toMatch(/sentence_text[\s\S]{0,300}min-h-\[44px\]/);
  });

  it("Translate remaining button has min-h-[44px]", () => {
    expect(src).toMatch(/handleTranslateWholeBook[\s\S]{0,300}min-h-\[44px\]/);
  });
});

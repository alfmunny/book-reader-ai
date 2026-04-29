/**
 * Regression tests for #2198: focus-visible rings on BookCard remove,
 * VocabWordTooltip save, and upload chapter remove buttons.
 */
import * as fs from "fs";
import * as path from "path";

const bookCardSrc = fs.readFileSync(
  path.join(__dirname, "../components/BookCard.tsx"),
  "utf8"
);

const vocabTooltipSrc = fs.readFileSync(
  path.join(__dirname, "../components/VocabWordTooltip.tsx"),
  "utf8"
);

const uploadSrc = fs.readFileSync(
  path.join(__dirname, "../app/upload/[bookId]/chapters/page.tsx"),
  "utf8"
);

describe("BookCard focus rings (closes #2198)", () => {
  it("Remove book button has focus ring", () => {
    // className comes after aria-label — look forward
    const idx = bookCardSrc.indexOf("aria-label={`Remove");
    expect(idx).toBeGreaterThan(-1);
    const window = bookCardSrc.slice(idx, idx + 420);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("VocabWordTooltip focus rings (closes #2198)", () => {
  it("Save to vocab button has focus ring", () => {
    // className comes before button label text — look backward
    const idx = vocabTooltipSrc.indexOf("Save to vocab");
    expect(idx).toBeGreaterThan(-1);
    const window = vocabTooltipSrc.slice(Math.max(0, idx - 460), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("Upload chapters focus rings (closes #2198)", () => {
  it("Remove chapter button has focus ring", () => {
    // className comes after aria-label — look forward
    const idx = uploadSrc.indexOf("Remove chapter");
    expect(idx).toBeGreaterThan(-1);
    const window = uploadSrc.slice(idx, idx + 380);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

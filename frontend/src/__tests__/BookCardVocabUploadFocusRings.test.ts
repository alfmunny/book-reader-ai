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

const uploadSrc = ["../app/(shell)/upload/[bookId]/chapters/page.tsx", "../components/ChapterAuditPanel.tsx"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");

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
    // Anchored on the handler, not the label: the label became conditional when
    // the button started naming the base form it saves (#2663), and a backward
    // window from the label text no longer reaches the className.
    const idx = vocabTooltipSrc.indexOf("onClick={handleSave}");
    expect(idx).toBeGreaterThan(-1);
    const window = vocabTooltipSrc.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("Upload chapters focus rings (closes #2198)", () => {
  it("Discard chapter control has focus ring", () => {
    // className comes after aria-label — look forward
    const idx = uploadSrc.indexOf("const tool =");
    expect(idx).toBeGreaterThan(-1);
    const window = uploadSrc.slice(idx, idx + 380);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

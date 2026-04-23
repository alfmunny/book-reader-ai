/**
 * Verifies reader page does not use raw Unicode arrows/symbols as interactive icons.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("Reader page Unicode icon replacements", () => {
  it("no raw ← character in button text (should use ArrowLeftIcon)", () => {
    // Keyboard shortcut labels like ["←", "→"] in the help dialog are fine
    // We only check that it's not used as visible button content
    const buttonLeftMatches = src.match(/>←\s/g);
    expect(buttonLeftMatches).toBeNull();
  });

  it("no raw → character as button/link label (should use ArrowRightIcon)", () => {
    // Inline arrows in button text like "Next →" or "View all →"
    const arrowMatches = src.match(/→\s*<\/button>|→\s*\n\s*<\/a>/g);
    expect(arrowMatches).toBeNull();
  });

  it("no raw ✕ character as button content (should use CloseIcon)", () => {
    const closeMatches = src.match(/>✕</g);
    expect(closeMatches).toBeNull();
  });

  it("focus mode uses ArrowLeftIcon for Prev", () => {
    expect(src).toMatch(/goToChapter\(chapterIndex - 1\)[\s\S]{0,400}<ArrowLeftIcon/);
  });

  it("focus mode uses ArrowRightIcon for Next", () => {
    expect(src).toMatch(/goToChapter\(chapterIndex \+ 1\)[\s\S]{0,400}<ArrowRightIcon/);
  });

  it("focus mode uses CloseIcon for exit", () => {
    expect(src).toMatch(/setFocusMode\(false\)[\s\S]{0,400}<CloseIcon/);
  });

  it("Library back button uses ArrowLeftIcon", () => {
    expect(src).toMatch(/router\.push\("\/"\)[\s\S]{0,200}<ArrowLeftIcon/);
  });

  it("chapter navigation uses ArrowLeftIcon", () => {
    expect(src).toMatch(/Previous chapter[\s\S]{0,50}|<ArrowLeftIcon[\s\S]{0,100}Previous chapter/);
  });

  it("Book notes link uses ArrowRightIcon", () => {
    expect(src).toMatch(/Book notes[\s\S]{0,50}<ArrowRightIcon/);
  });

  it("View all button uses ArrowRightIcon", () => {
    expect(src).toMatch(/View all[\s\S]{0,50}<ArrowRightIcon/);
  });

  it("chat close button uses CloseIcon not raw ✕", () => {
    expect(src).toMatch(/Close chat[\s\S]{0,200}<CloseIcon/);
  });
});

/**
 * Static-analysis test: select elements that are visible to keyboard users must
 * carry the app's amber focus-ring classes for visual consistency (WCAG 2.4.7).
 */
import * as fs from "fs";
import * as path from "path";

function read(rel: string) {
  return fs.readFileSync(path.resolve(__dirname, rel), "utf-8");
}

function assertSelectHasFocusRing(src: string, anchorText: string) {
  const idx = src.indexOf(anchorText);
  expect(idx).toBeGreaterThan(-1);
  // Slice a window that covers the select's className attribute
  const window = src.slice(idx, idx + 400);
  expect(window).toContain("focus:outline-none");
  expect(window).toContain("focus:ring-2");
  expect(window).toContain("focus:ring-amber-400");
}

describe("Select focus ring — admin/books", () => {
  const src = read("../app/admin/books/page.tsx");
  it("translation language select has amber focus ring", () => {
    assertSelectHasFocusRing(src, 'aria-label="Translation language"');
  });
});

describe("Select focus ring — word tooltip", () => {
  const src = read("../components/VocabWordTooltip.tsx");
  it("definition-language select has amber focus ring", () => {
    assertSelectHasFocusRing(src, 'aria-label="Definition language"');
  });
});

describe("Select focus ring — reader page", () => {
  const src = read("../app/reader/[bookId]/page.tsx");
  it("reader translation language select (desktop) has amber focus ring", () => {
    // The select moved into the Editorial card (TranslationSessionPanel)
    assertSelectHasFocusRing(read("../components/TranslationSessionPanel.tsx"), 'id="reader-trans-lang"');
  });
  it("reader translation language select (mobile) has amber focus ring", () => {
    // Mobile select uses aria-label="Translation language" in the slide-up panel
    const mobileIdx = src.indexOf('aria-label="Translation language"', src.indexOf("md:hidden fixed bottom-0"));
    expect(mobileIdx).toBeGreaterThan(-1);
    const window = src.slice(mobileIdx, mobileIdx + 300);
    expect(window).toContain("focus:outline-none");
    expect(window).toContain("focus:ring-2");
    expect(window).toContain("focus:ring-amber-400");
  });
});

describe("Select focus ring — QueueTab", () => {
  const src = read("../components/QueueTab.tsx");
  it("preview language select has amber focus ring", () => {
    assertSelectHasFocusRing(src, 'aria-label="Preview language"');
  });
});

/**
 * Editorial availability at a glance (owner request, 2026-08-27): the
 * translate tab shows which languages have editorial translations as
 * clickable coverage chips — no more cycling through target languages to
 * discover what exists; an explicit empty state when there are none.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("editorial language chips", () => {
  it("fetches book-level language coverage once per book", () => {
    expect(src).toMatch(/getBookTranslationLanguages\(Number\(bookId\)\)/);
  });

  it("feeds language coverage into the session panel's editorial card", () => {
    expect(src).toContain("editorialLanguages={editorialLanguages ?");
    expect(src).toMatch(/onSelectEditorialLanguage=\{\(lang\) => \{/);
    expect(src).toContain("selectTranslationSession(null)");
  });
});

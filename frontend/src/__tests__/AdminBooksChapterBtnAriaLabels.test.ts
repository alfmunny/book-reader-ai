/**
 * Regression test for #1905: admin books chapter-translation row buttons
 * must have aria-label so screen readers can distinguish "Move Ch. 1 zh"
 * from "Move Ch. 2 zh" (WCAG 4.1.2 Name, Role, Value).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/admin/books/page.tsx"),
  "utf8",
);

describe("Admin books page chapter-row button aria-labels (closes #1905)", () => {
  it("Move button has aria-label with chapter index and target language", () => {
    expect(src).toMatch(/aria-label=\{`Move Ch\. \$\{t\.chapter_index \+ 1\} \$\{t\.target_language\}/);
  });

  it("Retranslate button has aria-label with chapter index and target language", () => {
    expect(src).toMatch(/aria-label=\{`Retranslate Ch\. \$\{t\.chapter_index \+ 1\} \$\{t\.target_language\}/);
  });

  it("Delete chapter translation button has aria-label with chapter index and target language", () => {
    expect(src).toMatch(/aria-label=\{`Delete Ch\. \$\{t\.chapter_index \+ 1\} \$\{t\.target_language\}/);
  });
});

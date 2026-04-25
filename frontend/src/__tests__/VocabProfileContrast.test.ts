/**
 * Regression test for #1349: vocabulary and profile pages WCAG 1.4.3 contrast failures.
 * text-stone-400 on white = 2.65:1 (fail). text-stone-400 on stone-100 = 2.24:1 (fail).
 * text-stone-500 = 4.86:1 on white (pass). text-stone-600 on stone-100 = 6.26:1 (pass).
 */
import * as fs from "fs";
import * as path from "path";

const vocabSrc = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/page.tsx"),
  "utf8",
);
const profileSrc = fs.readFileSync(
  path.join(__dirname, "../app/profile/page.tsx"),
  "utf8",
);

describe("Vocabulary and profile pages contrast (closes #1349)", () => {
  it("vocabulary/page.tsx has no text-sm text-stone-400 (2.65:1 fail)", () => {
    expect(vocabSrc).not.toContain('"text-sm text-stone-400');
    expect(vocabSrc).not.toContain('"text-center text-stone-400');
  });

  it("vocabulary/page.tsx has no text-xs text-stone-400 (2.65:1 fail)", () => {
    expect(vocabSrc).not.toMatch(/text-xs[^"]*text-stone-400|text-stone-400[^"]*text-xs/);
  });

  it("vocabulary/page.tsx occurrence-count badge uses text-stone-600 (6.26:1 on stone-100)", () => {
    // bg-stone-100 badge requires stone-600 since stone-500 = 4.1:1 (fails AA on stone-100)
    expect(vocabSrc).not.toContain("text-stone-400 bg-stone-100");
    expect(vocabSrc).toContain("text-stone-600 bg-stone-100");
  });

  it("profile/page.tsx has no text-xs text-stone-400 (2.65:1 fail)", () => {
    expect(profileSrc).not.toMatch(/text-xs[^"]*text-stone-400|text-stone-400[^"]*text-xs/);
  });
});

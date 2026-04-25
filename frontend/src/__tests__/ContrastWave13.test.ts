import * as fs from "fs";
import * as path from "path";

function read(rel: string) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

/**
 * Counts uses of `text-amber-{500,600}` paired with custom small sizes
 * (`text-[10px]` or `text-[11px]`) inside the same className. Hover-only
 * `hover:text-amber-{500,600}` is exempt.
 */
function countCustomSmallAmber(content: string): number {
  const allClassNames = content.match(/className="[^"]*"/g) ?? [];
  let count = 0;
  for (const cn of allClassNames) {
    const hasCustomSmall = /\btext-\[(10|11)px\]/.test(cn);
    const hasFailingAmber = /(?<!hover:)\btext-amber-(500|600)\b/.test(cn);
    if (hasCustomSmall && hasFailingAmber) count++;
  }
  return count;
}

describe("WCAG 1.4.3 contrast — text-amber-500/600 at custom sizes (wave 13) (closes #1413)", () => {
  it("reader page has no text-amber-{500,600} at text-[10px]/[11px]", () => {
    expect(countCustomSmallAmber(read("app/reader/[bookId]/page.tsx"))).toBe(0);
  });

  it("home page hero card labels have no text-amber-{500,600} at text-[11px]", () => {
    expect(countCustomSmallAmber(read("app/page.tsx"))).toBe(0);
  });

  it("VocabWordTooltip has no text-amber-{500,600} at text-[11px]", () => {
    expect(countCustomSmallAmber(read("components/VocabWordTooltip.tsx"))).toBe(0);
  });
});

import * as fs from "fs";
import * as path from "path";

function countAmber500AtSmallSize(content: string): number {
  // Skip hover:text-amber-500 — only static color counts.
  // Match className strings that contain text-amber-500 alongside text-xs/text-sm.
  const allClassNames = content.match(/className="[^"]*"/g) ?? [];
  let count = 0;
  for (const cn of allClassNames) {
    const hasSmall = /\btext-(xs|sm)\b/.test(cn);
    const hasAmber500Static = /(?<!hover:)\btext-amber-500\b/.test(cn);
    if (hasSmall && hasAmber500Static) count++;
  }
  return count;
}

function read(rel: string) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

describe("WCAG 1.4.3 contrast — text-amber-500 at small sizes (wave 11) (closes #1396)", () => {
  it("reader page has no text-amber-500 at xs/sm", () => {
    expect(countAmber500AtSmallSize(read("app/reader/[bookId]/page.tsx"))).toBe(0);
  });
  it("WordActionDrawer.tsx has no text-amber-500 at xs/sm", () => {
    expect(countAmber500AtSmallSize(read("components/WordActionDrawer.tsx"))).toBe(0);
  });
  it("BookCard.tsx has no text-amber-500 at xs/sm", () => {
    expect(countAmber500AtSmallSize(read("components/BookCard.tsx"))).toBe(0);
  });
  it("WordLookup.tsx has no text-amber-500 at xs/sm", () => {
    expect(countAmber500AtSmallSize(read("components/WordLookup.tsx"))).toBe(0);
  });
});

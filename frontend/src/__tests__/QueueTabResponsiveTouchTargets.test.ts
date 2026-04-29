/**
 * Regression test for #2136 — QueueTab admin buttons must pair
 * min-h-[44px] with md:min-h-0 so desktop chrome isn't oversized.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8",
);

test("every min-h-[44px] in QueueTab is paired with md:min-h-0 on the same className", () => {
  // Match full className="..." or className={`...`} strings containing min-h-[44px]
  const doubleQuoteMatches = Array.from(
    src.matchAll(/className="([^"]*)"/g),
    (m) => m[1],
  ).filter((cls) => cls.includes("min-h-[44px]"));

  const templateMatches = Array.from(
    src.matchAll(/className=\{`([^`]*)`\}/gs),
    (m) => m[1],
  ).filter((cls) => cls.includes("min-h-[44px]"));

  const allMatches = [...doubleQuoteMatches, ...templateMatches];
  expect(allMatches.length).toBeGreaterThan(0);

  for (const cls of allMatches) {
    expect(cls).toContain("md:min-h-0");
  }
});

test("every min-w-[44px] in QueueTab is paired with md:min-w-0 on the same className", () => {
  const doubleQuoteMatches = Array.from(
    src.matchAll(/className="([^"]*)"/g),
    (m) => m[1],
  ).filter((cls) => cls.includes("min-w-[44px]"));

  const templateMatches = Array.from(
    src.matchAll(/className=\{`([^`]*)`\}/gs),
    (m) => m[1],
  ).filter((cls) => cls.includes("min-w-[44px]"));

  const allMatches = [...doubleQuoteMatches, ...templateMatches];
  expect(allMatches.length).toBeGreaterThan(0);

  for (const cls of allMatches) {
    expect(cls).toContain("md:min-w-0");
  }
});

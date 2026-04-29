/**
 * Regression test for #2138 — reader page interactive elements must pair
 * min-h-[44px] with md:min-h-0 so desktop chrome isn't oversized.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

test("every min-h-[44px] in reader page className string is paired with md:min-h-0", () => {
  // Match className="..." double-quoted strings
  const doubleQuoteMatches = Array.from(
    src.matchAll(/className="([^"]*)"/g),
    (m) => ({ cls: m[1], raw: m[0] }),
  ).filter(({ cls }) => cls.includes("min-h-[44px]"));

  // Match className={`...`} template literals
  const templateMatches = Array.from(
    src.matchAll(/className=\{`([^`]*)`\}/gs),
    (m) => ({ cls: m[1], raw: m[0] }),
  ).filter(({ cls }) => cls.includes("min-h-[44px]"));

  const allMatches = [...doubleQuoteMatches, ...templateMatches];
  expect(allMatches.length).toBeGreaterThan(0);

  for (const { cls, raw } of allMatches) {
    // lg:min-h-0 is also acceptable (elements hidden below lg)
    const hasResponsiveReset =
      cls.includes("md:min-h-0") || cls.includes("lg:min-h-0");
    expect(`${raw.slice(0, 80)}…`).toMatch(
      hasResponsiveReset ? /.*/ : /FAIL — missing md:min-h-0/,
    );
    expect(hasResponsiveReset).toBe(true);
  }
});

test("every min-w-[44px] in reader page className string is paired with md:min-w-0 or lg:min-w-0", () => {
  const doubleQuoteMatches = Array.from(
    src.matchAll(/className="([^"]*)"/g),
    (m) => ({ cls: m[1] }),
  ).filter(({ cls }) => cls.includes("min-w-[44px]"));

  const templateMatches = Array.from(
    src.matchAll(/className=\{`([^`]*)`\}/gs),
    (m) => ({ cls: m[1] }),
  ).filter(({ cls }) => cls.includes("min-w-[44px]"));

  const allMatches = [...doubleQuoteMatches, ...templateMatches];
  expect(allMatches.length).toBeGreaterThan(0);

  for (const { cls } of allMatches) {
    const hasResponsiveReset =
      cls.includes("md:min-w-0") || cls.includes("lg:min-w-0");
    expect(hasResponsiveReset).toBe(true);
  }
});

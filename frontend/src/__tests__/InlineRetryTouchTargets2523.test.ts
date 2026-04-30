/**
 * Regression tests for #2523:
 * Inline retry/action buttons styled text-xs py-1.5 must include
 * min-h-[44px] md:min-h-0 so mobile touch targets meet WCAG 2.5.5 (44×44px).
 */
import fs from "fs";
import path from "path";

function readSrc(relPath: string) {
  return fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf-8");
}

const filesToCheck = [
  { rel: "app/page.tsx", label: "home page" },
  { rel: "app/search/page.tsx", label: "search page" },
  { rel: "app/upload/page.tsx", label: "upload page" },
  { rel: "app/profile/page.tsx", label: "profile page" },
  { rel: "app/vocabulary/page.tsx", label: "vocabulary page" },
  { rel: "components/ReadingStats.tsx", label: "ReadingStats component" },
];

describe("Inline retry buttons — WCAG 2.5.5 touch target (closes #2523)", () => {
  for (const { rel, label } of filesToCheck) {
    it(`${label} has no text-xs py-1.5 button without min-h-[44px]`, () => {
      const src = readSrc(rel);
      // Find className strings that have both text-xs and py-1.5 but lack min-h-[44px]
      const badPattern =
        /className="[^"]*(?:text-xs[^"]*py-1\.5|py-1\.5[^"]*text-xs)[^"]*"/g;
      const matches = src.match(badPattern) ?? [];
      const violations = matches.filter((m) => !m.includes("min-h-[44px]"));
      expect(violations).toHaveLength(0);
    });
  }
});

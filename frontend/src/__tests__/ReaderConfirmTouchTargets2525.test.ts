/**
 * Regression tests for #2525:
 * Reader sidebar retry buttons and inline confirm/cancel dialogs styled
 * text-xs py-1.5 must include min-h-[44px] md:min-h-0 for WCAG 2.5.5.
 */
import fs from "fs";
import path from "path";

function readSrc(relPath: string) {
  return fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf-8");
}

const filesToCheck = [
  { rel: "app/reader/[bookId]/page.tsx", label: "reader page" },
  { rel: "components/QueueTab.tsx", label: "QueueTab component" },
  { rel: "app/admin/books/page.tsx", label: "admin books page" },
];

describe("Reader/confirm button touch targets — WCAG 2.5.5 (closes #2525)", () => {
  for (const { rel, label } of filesToCheck) {
    it(`${label} has no text-xs py-1.5 button without min-h-[44px]`, () => {
      const src = readSrc(rel);
      // Extract all className="..." strings and find those that look like
      // interactive buttons missing the 44px touch target.
      // Button heuristics: has text-xs + py-1.5, has focus: (not just a container),
      // is not a styled <select> (appearance-none), lacks min-h-[44px].
      const classPattern = /className="([^"]+)"/g;
      const violations: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = classPattern.exec(src)) !== null) {
        const cls = m[1];
        if (
          cls.includes("text-xs") &&
          cls.includes("py-1.5") &&
          cls.includes("focus:") &&
          !cls.includes("appearance-none") &&
          !cls.includes("min-h-[44px]")
        ) {
          violations.push(cls);
        }
      }
      expect(violations).toHaveLength(0);
    });
  }
});

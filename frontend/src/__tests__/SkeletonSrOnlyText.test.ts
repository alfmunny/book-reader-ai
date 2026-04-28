/**
 * Regression test for #1871 — skeleton/loading live regions used
 * `role="status" aria-label="..."` with no text content inside.
 * ARIA live regions announce text content changes, not aria-label.
 * Each skeleton container needs a <span className="sr-only"> text node
 * so screen readers announce the loading state when the element mounts.
 */
import { readFileSync } from "fs";
import { join } from "path";

const readSrc = (rel: string) =>
  readFileSync(join(process.cwd(), rel), "utf-8");

/** Returns all role="status" aria-label="..." blocks that lack an sr-only span */
function findStatusWithoutSrOnly(src: string): string[] {
  // Match role="status" aria-label="..." immediately followed (within 400 chars) by content
  // that does NOT contain className="sr-only"
  const statusPattern = /role="status"\s+aria-label="([^"]+)"[^>]*>([\s\S]{0,400}?)<\/div>/g;
  const issues: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = statusPattern.exec(src)) !== null) {
    const block = m[2];
    // Accept sr-only span OR visible paragraph/span text (both are readable by AT)
    if (!block.includes("sr-only") && !block.includes("<p") && !block.includes("<span")) {
      issues.push(`aria-label="${m[1]}" — missing accessible text content`);
    }
  }
  return issues;
}

const FILES = [
  "src/app/loading.tsx",
  "src/app/page.tsx",
  "src/app/admin/layout.tsx",
  "src/app/admin/audio/page.tsx",
  "src/app/admin/books/page.tsx",
  "src/app/admin/users/page.tsx",
  "src/app/admin/uploads/page.tsx",
  "src/app/reader/[bookId]/page.tsx",
  "src/app/decks/page.tsx",
  "src/app/decks/[deckId]/page.tsx",
  "src/app/notes/page.tsx",
  "src/app/notes/[bookId]/page.tsx",
  "src/app/vocabulary/flashcards/page.tsx",
  "src/app/vocabulary/page.tsx",
  "src/app/search/page.tsx",
  "src/app/upload/page.tsx",
  "src/app/upload/[bookId]/chapters/page.tsx",
];

describe("Skeleton live regions have sr-only text (WCAG 4.1.3 / #1871)", () => {
  for (const file of FILES) {
    it(`${file} — all role="status" aria-label skeletons include sr-only text`, () => {
      const src = readSrc(file);
      const issues = findStatusWithoutSrOnly(src);
      expect(issues).toHaveLength(0);
    });
  }
});

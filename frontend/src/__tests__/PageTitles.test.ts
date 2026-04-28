/**
 * Regression for #1841 — every routable page must export a distinct <title>
 * so screen readers can announce the page name on navigation (WCAG 2.4.2).
 *
 * All page.tsx files use "use client" and cannot export metadata directly.
 * Metadata lives in co-located layout.tsx (server components) at each route.
 */
import { readFileSync } from "fs";
import { join } from "path";

function readLayout(rel: string) {
  return readFileSync(join(__dirname, "..", "app", rel), "utf-8");
}

const SUFFIX = "Book Reader AI";

function hasMetadataExport(src: string): boolean {
  return src.includes("export const metadata") || /export\s+(async\s+)?function\s+generateMetadata/.test(src);
}

function hasDistinctTitle(src: string): boolean {
  // Simple string: title: "Vocabulary"
  const m1 = src.match(/\btitle:\s*["'`]([^"'`]+)["'`]/);
  if (m1 && m1[1].trim() !== SUFFIX) return true;
  // Template object default — root layout uses: default: "My Library — Book Reader AI"
  const m2 = src.match(/\bdefault:\s*["'`]([^"'`]+)["'`]/);
  if (m2 && m2[1].trim() !== SUFFIX) return true;
  return false;
}

describe("WCAG 2.4.2 — per-page <title> (closes #1841)", () => {
  const staticLayouts = [
    "layout.tsx",                      // root → My Library (template default)
    "vocabulary/layout.tsx",
    "vocabulary/flashcards/layout.tsx",
    "notes/layout.tsx",
    "profile/layout.tsx",
    "upload/layout.tsx",
    "login/layout.tsx",
    "search/layout.tsx",
  ];

  staticLayouts.forEach((rel) => {
    it(`${rel} has a distinct metadata title`, () => {
      const src = readLayout(rel);
      expect(hasMetadataExport(src)).toBe(true);
      expect(hasDistinctTitle(src)).toBe(true);
    });
  });

  it("reader/[bookId]/layout.tsx exports generateMetadata for dynamic book title", () => {
    const src = readLayout("reader/[bookId]/layout.tsx");
    expect(src).toMatch(/export\s+(async\s+)?function\s+generateMetadata/);
  });

  it("notes/[bookId]/layout.tsx exports generateMetadata for dynamic book title", () => {
    const src = readLayout("notes/[bookId]/layout.tsx");
    expect(src).toMatch(/export\s+(async\s+)?function\s+generateMetadata/);
  });
});

describe("WCAG 2.4.2 — follow-up page titles (closes #1844)", () => {
  const staticLayouts = [
    "pending/layout.tsx",
    "decks/layout.tsx",
    "decks/new/layout.tsx",
    "import/[bookId]/layout.tsx",
    "upload/[bookId]/chapters/layout.tsx",
  ];

  staticLayouts.forEach((rel) => {
    it(`${rel} has a distinct metadata title`, () => {
      const src = readLayout(rel);
      expect(hasMetadataExport(src)).toBe(true);
      expect(hasDistinctTitle(src)).toBe(true);
    });
  });

  it("decks/[deckId]/layout.tsx exports generateMetadata for dynamic deck title", () => {
    const src = readLayout("decks/[deckId]/layout.tsx");
    expect(src).toMatch(/export\s+(async\s+)?function\s+generateMetadata/);
  });
});

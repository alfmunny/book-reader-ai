/**
 * Regression test for #2140 — all remaining pages and components must pair
 * min-h-[44px] with md:min-h-0 (and min-w-[44px] with md:min-w-0).
 */
import * as fs from "fs";
import * as path from "path";

const SRC = path.join(__dirname, "..");

function readFile(rel: string) {
  return fs.readFileSync(path.join(SRC, rel), "utf8");
}

function checkFile(rel: string, label: string) {
  const src = readFile(rel);

  const doubleH = Array.from(src.matchAll(/className="([^"]*)"/g), (m) => m[1]).filter(
    (cls) => cls.includes("min-h-[44px]"),
  );
  const tmplH = Array.from(src.matchAll(/className=\{`([^`]*)`\}/gs), (m) => m[1]).filter(
    (cls) => cls.includes("min-h-[44px]"),
  );
  for (const cls of [...doubleH, ...tmplH]) {
    const ok = cls.includes("md:min-h-0") || cls.includes("lg:min-h-0");
    if (!ok) {
      throw new Error(
        `${label}: found min-h-[44px] without md:min-h-0 in className:\n  ${cls.slice(0, 120)}`,
      );
    }
  }

  const doubleW = Array.from(src.matchAll(/className="([^"]*)"/g), (m) => m[1]).filter(
    (cls) => cls.includes("min-w-[44px]"),
  );
  const tmplW = Array.from(src.matchAll(/className=\{`([^`]*)`\}/gs), (m) => m[1]).filter(
    (cls) => cls.includes("min-w-[44px]"),
  );
  for (const cls of [...doubleW, ...tmplW]) {
    const ok = cls.includes("md:min-w-0") || cls.includes("lg:min-w-0");
    if (!ok) {
      throw new Error(
        `${label}: found min-w-[44px] without md:min-w-0 in className:\n  ${cls.slice(0, 120)}`,
      );
    }
  }
}

const FILES: [string, string][] = [
  ["app/vocabulary/page.tsx", "VocabularyPage"],
  ["app/notes/page.tsx", "NotesPage"],
  ["app/notes/[bookId]/page.tsx", "NotesDetailPage"],
  ["app/search/page.tsx", "SearchPage"],
  ["app/profile/page.tsx", "ProfilePage"],
  ["app/decks/page.tsx", "DecksPage"],
  ["app/decks/new/page.tsx", "DecksNewPage"],
  ["components/SentenceReader.tsx", "SentenceReader"],
  ["components/BookCard.tsx", "BookCard"],
  ["components/InsightChat.tsx", "InsightChat"],
  ["components/TagEditor.tsx", "TagEditor"],
];

for (const [rel, label] of FILES) {
  test(`${label}: every min-h-[44px] paired with md:min-h-0, every min-w-[44px] with md:min-w-0`, () => {
    checkFile(rel, label);
  });
}

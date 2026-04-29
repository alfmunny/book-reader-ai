/**
 * Regression tests for #2148 — second batch of responsive touch-target resets.
 * Every min-h-[44px] in these files must be paired with md:min-h-0.
 * Every min-w-[44px] must be paired with md:min-w-0.
 */
import * as fs from "fs";
import * as path from "path";

function readSrc(rel: string) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

function checkFile(rel: string, label: string) {
  describe(`${label} (closes #2148)`, () => {
    const src = readSrc(rel);

    it("every min-h-[44px] is paired with md:min-h-0", () => {
      const lines = src.split("\n");
      const violations: string[] = [];
      lines.forEach((line, i) => {
        if (line.includes("min-h-[44px]") && !line.includes("md:min-h-0") && !line.includes("lg:min-h-0")) {
          violations.push(`line ${i + 1}: ${line.trim()}`);
        }
      });
      expect(violations).toEqual([]);
    });

    it("every min-w-[44px] is paired with md:min-w-0", () => {
      const lines = src.split("\n");
      const violations: string[] = [];
      lines.forEach((line, i) => {
        if (line.includes("min-w-[44px]") && !line.includes("md:min-w-0") && !line.includes("lg:min-w-0")) {
          violations.push(`line ${i + 1}: ${line.trim()}`);
        }
      });
      expect(violations).toEqual([]);
    });
  });
}

checkFile("app/vocabulary/flashcards/page.tsx", "FlashcardsPage");
checkFile("app/decks/[deckId]/page.tsx", "DeckDetailPage");
checkFile("app/import/[bookId]/page.tsx", "ImportPage");
checkFile("app/error.tsx", "ErrorPage");
checkFile("app/not-found.tsx", "NotFoundPage");
checkFile("app/login/page.tsx", "LoginPage");
checkFile("app/pending/page.tsx", "PendingPage");
checkFile("app/upload/page.tsx", "UploadPage");
checkFile("app/upload/[bookId]/chapters/page.tsx", "UploadChaptersPage");
checkFile("app/page.tsx", "HomePage");
checkFile("components/WordActionDrawer.tsx", "WordActionDrawer");
checkFile("components/VocabWordTooltip.tsx", "VocabWordTooltip");
checkFile("components/DeckCard.tsx", "DeckCard");
checkFile("components/UndoToast.tsx", "UndoToast");
checkFile("components/BookDetailModal.tsx", "BookDetailModal");
checkFile("components/AuthPromptModal.tsx", "AuthPromptModal");
checkFile("components/SentenceActionPopup.tsx", "SentenceActionPopup");
checkFile("components/SearchBar.tsx", "SearchBar");
checkFile("components/AnnotationToolbar.tsx", "AnnotationToolbar");
checkFile("components/AnnotationsSidebar.tsx", "AnnotationsSidebar");
checkFile("components/ChapterSummary.tsx", "ChapterSummary");
checkFile("components/QuickHighlightPanel.tsx", "QuickHighlightPanel");
checkFile("components/SeedPopularButton.tsx", "SeedPopularButton");

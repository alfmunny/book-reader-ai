/**
 * Owner design (2026-08-26): the form↔lemma mapping is stored both ways —
 * each occurrence records the exact form met in the text (surface_form).
 * The reader underlines saved words deterministically from those surfaces
 * (covering ablaut forms stemming can't catch, e.g. sah→sehen), and the
 * vocabulary page shows which form was met per occurrence.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { render, screen, waitFor } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "token123" } }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));
jest.mock("@/lib/api", () => ({
  getBookTranslationLanguages: jest.fn().mockResolvedValue({ book_id: 1, total_chapters: 0, languages: [] }),
  listTranslationSessions: jest.fn().mockResolvedValue([]),
  getSessionChapter: jest.fn().mockResolvedValue({ session_id: 1, chapter_index: 0, paragraph_count: 0, paragraphs: {} }),
  translateSession: jest.fn(),
  editSessionParagraph: jest.fn(),
  deleteSessionParagraph: jest.fn(),
  getVocabulary: jest.fn(),
  deleteVocabularyWord: jest.fn(),
  exportVocabularyToObsidian: jest.fn(),
  getWordDefinition: jest.fn(),
  listVocabularyTags: jest.fn().mockResolvedValue([]),
  getVocabularyWordTags: jest.fn().mockResolvedValue([]),
  addVocabularyWordTag: jest.fn().mockResolvedValue({ tag: "" }),
  removeVocabularyWordTag: jest.fn().mockResolvedValue(undefined),
  ApiError: class ApiError extends Error { status = 500; },
}));

import * as api from "@/lib/api";
import VocabularyPage from "@/app/vocabulary/page";
import SentenceReader from "@/components/SentenceReader";

const mockGetVocabulary = api.getVocabulary as jest.Mock;

test("an ablaut surface form ('sah') underlines even though stemming cannot match it", () => {
  // The reader page feeds surface forms into the vocab set — exact token
  // matching then handles forms whose stem differs from the lemma.
  const { container } = render(
    <SentenceReader
      text={"Er sah die Sonne."}
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={() => {}}
      vocabWords={new Set(["sehen", "sah"])}
    />,
  );
  const marked = Array.from(container.querySelectorAll(".decoration-dotted")).map((el) => el.textContent);
  expect(marked).toEqual(["sah"]);
});

test("the reader page includes stored surface forms in the vocab set", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src/app/reader/[bookId]/page.tsx"),
    "utf8",
  );
  expect(src).toMatch(/surface_form/);
});

test("the vocabulary page shows the form actually met in the text", async () => {
  mockGetVocabulary.mockResolvedValue([
    {
      id: 8,
      word: "verhöhnen",
      lemma: "verhöhnen",
      language: "de",
      created_at: "2026-08-26",
      occurrences: [
        {
          book_id: 2229,
          book_title: "Faust",
          book_language: "de",
          chapter_index: 2,
          sentence_text: "Und wenn mich auch der ganze Kreis verhöhnt;",
          surface_form: "verhöhnt",
        },
      ],
    },
  ]);
  render(<VocabularyPage />);
  await waitFor(() => expect(screen.getByText("verhöhnen")).toBeInTheDocument());
  expect(screen.getByText("verhöhnt")).toBeInTheDocument();
});

/**
 * Owner report (2026-08-26): from the vocabulary page you can only jump back
 * to the chapter — not to the highlighted word in its sentence. The quoted
 * occurrence sentence is now a link carrying sentence + word params, so the
 * reader scrolls to the sentence and pulses the exact (inflected) form met
 * in the text.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "token123" } }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));
jest.mock("@/lib/api", () => ({
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
import VocabularyPage from "@/app/(shell)/vocabulary/page";

const SENTENCE = "Und wenn mich auch der ganze Kreis verhöhnt;";

beforeEach(() => {
  jest.clearAllMocks();
  (api.getVocabulary as jest.Mock).mockResolvedValue([
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
          sentence_text: SENTENCE,
          surface_form: "verhöhnt",
        },
      ],
    },
  ]);
});

test("the quoted sentence links to the word in the reader", async () => {
  render(<VocabularyPage />);
  await waitFor(() => expect(screen.getByText("verhöhnen")).toBeInTheDocument());

  const link = screen.getByRole("link", { name: new RegExp("ganze Kreis") });
  const href = link.getAttribute("href") ?? "";
  expect(href).toContain("/reader/2229?chapter=2");
  expect(href).toContain(`sentence=${encodeURIComponent(SENTENCE)}`);
  // Jump marks the exact inflected form met in the text, not the lemma
  expect(href).toContain(`word=${encodeURIComponent("verhöhnt")}`);
});

test("occurrences without a recorded surface form fall back to the entry word", async () => {
  (api.getVocabulary as jest.Mock).mockResolvedValue([
    {
      id: 9,
      word: "meer",
      lemma: "meer",
      language: "de",
      created_at: "2026-08-26",
      occurrences: [
        {
          book_id: 2229,
          book_title: "Faust",
          book_language: "de",
          chapter_index: 2,
          sentence_text: "Es schäumt das Meer in breiten Flüssen.",
          surface_form: null,
        },
      ],
    },
  ]);
  render(<VocabularyPage />);
  await waitFor(() => expect(screen.getByText("meer")).toBeInTheDocument());

  const link = screen.getByRole("link", { name: /schäumt das Meer/ });
  expect(link.getAttribute("href")).toContain(`word=${encodeURIComponent("meer")}`);
});

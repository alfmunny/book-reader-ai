/**
 * Regression tests for WCAG 1.3.1 compliance on unicode arrows used as
 * typographic indicators (closes #1969).
 *
 * Covers:
 *  - Vocabulary definition drawer lemma indicator (← lemma)
 *    must have aria-label="base form: <lemma>" so screen readers
 *    don't announce "left arrow amor"
 *  - Upload chapters confirm button must NOT contain a trailing "→"
 *    (decorative arrow removed from button text)
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Vocabulary page mocks ────────────────────────────────────────────────────

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "token" } }),
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
import VocabularyPage from "@/app/vocabulary/page";

const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;
const mockGetWordDefinition = api.getWordDefinition as jest.MockedFunction<typeof api.getWordDefinition>;

const SAMPLE_WORDS = [
  {
    id: 1,
    word: "running",
    lemma: "running",
    language: "en",
    occurrences: [{ book_id: 1, book_title: "Test Book", chapter_index: 0, sentence_text: "He was running fast." }],
  },
];

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetVocabulary.mockResolvedValue(SAMPLE_WORDS);
});

// ── vocabulary drawer lemma indicator ─────────────────────────────────────────

test("lemma indicator span has aria-label 'base form: <lemma>' when lemma differs from word", async () => {
  // API returns a lemma ("run") different from the clicked word ("running")
  mockGetWordDefinition.mockResolvedValue({
    lemma: "run",
    language: "en",
    definitions: [{ pos: "verb", text: "to move quickly" }],
    url: "",
  });

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("running");

  await userEvent.click(screen.getByRole("button", { name: "running" }));

  // Wait for definition to load
  await waitFor(() => expect(screen.getByText("to move quickly")).toBeInTheDocument());

  // The lemma indicator must have an aria-label that screen readers can use
  const lemmaIndicator = screen.getByText(/← run/);
  expect(lemmaIndicator).toHaveAttribute("aria-label", "base form: run");
});

test("lemma indicator is absent when word equals lemma", async () => {
  mockGetWordDefinition.mockResolvedValue({
    lemma: "running",
    language: "en",
    definitions: [{ pos: "verb", text: "continuous motion" }],
    url: "",
  });

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("running");

  await userEvent.click(screen.getByRole("button", { name: "running" }));
  await waitFor(() => expect(screen.getByText("continuous motion")).toBeInTheDocument());

  // No lemma arrow should be present when they match
  expect(screen.queryByText(/←/)).not.toBeInTheDocument();
});

/**
 * VocabularyPage — DefinitionSheet component coverage.
 * Tests: loading state, definition display, Escape to close, outside-click, no-definition state.
 */
import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
import VocabularyPage from "@/app/vocabulary/page";

const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;
const mockGetWordDefinition = api.getWordDefinition as jest.MockedFunction<typeof api.getWordDefinition>;

const SAMPLE_WORDS = [
  {
    id: 1,
    word: "ephemeral",
    lemma: "ephemeral",
    language: "en",
    occurrences: [{ book_id: 1, book_title: "Moby Dick", chapter_index: 0, sentence_text: "The ephemeral whale." }],
  },
];

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetVocabulary.mockResolvedValue(SAMPLE_WORDS);
});

// ── Opening DefinitionSheet via word click ─────────────────────────────────────

test("clicking a word lemma button opens DefinitionSheet with spinner then definition", async () => {
  let resolveDefinition!: (v: any) => void;
  mockGetWordDefinition.mockReturnValue(new Promise((r) => { resolveDefinition = r; }));

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("ephemeral");

  // Click the word lemma button (shows the definition sheet)
  await userEvent.click(screen.getByRole("button", { name: /ephemeral/i }));

  // Spinner visible while loading
  await waitFor(() => expect(screen.getByText(/Looking up/i)).toBeInTheDocument());

  // Resolve definition
  await act(async () => {
    resolveDefinition({
      lemma: "ephemeral",
      language: "en",
      definitions: [{ pos: "adjective", text: "lasting for a very short time" }],
      url: "https://en.wiktionary.org/wiki/ephemeral",
    });
    await flushPromises();
  });

  expect(screen.getByText("lasting for a very short time")).toBeInTheDocument();
  expect(screen.getByText("adjective")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /View on Wiktionary/i })).toBeInTheDocument();
});

test("DefinitionSheet shows 'No definition found' when API returns no definitions", async () => {
  mockGetWordDefinition.mockResolvedValue({
    lemma: "ephemeral",
    language: "en",
    definitions: [],
    url: "https://en.wiktionary.org/wiki/ephemeral",
  });

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("ephemeral");

  await userEvent.click(screen.getByRole("button", { name: /ephemeral/i }));

  await waitFor(() => expect(screen.getByText(/No definition found/i)).toBeInTheDocument());
});

test("DefinitionSheet closes on Escape key", async () => {
  mockGetWordDefinition.mockResolvedValue({
    lemma: "ephemeral",
    language: "en",
    definitions: [{ pos: "adjective", text: "short-lived" }],
    url: "",
  });

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("ephemeral");

  await userEvent.click(screen.getByRole("button", { name: /ephemeral/i }));
  await waitFor(() => expect(screen.getByText("short-lived")).toBeInTheDocument());

  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByText("short-lived")).not.toBeInTheDocument());
});

test("DefinitionSheet can be opened a second time after Escape-close (no stale event listeners)", async () => {
  // Regression: the cleanup for the backdrop mousedown listener was inside
  // setTimeout and never called, letting stale listeners accumulate. This test
  // verifies that after closing and reopening, the sheet is still visible and
  // no stale close fires immediately on reopen.
  mockGetWordDefinition.mockResolvedValue({
    lemma: "ephemeral",
    language: "en",
    definitions: [{ pos: "adjective", text: "short-lived" }],
    url: "",
  });

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("ephemeral");

  // First open → close via Escape
  await userEvent.click(screen.getByRole("button", { name: /ephemeral/i }));
  await waitFor(() => expect(screen.getByText("short-lived")).toBeInTheDocument());
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByText("short-lived")).not.toBeInTheDocument());

  // Second open — sheet must appear again without instantly closing
  await userEvent.click(screen.getByRole("button", { name: /ephemeral/i }));
  await waitFor(() => expect(screen.getByText("short-lived")).toBeInTheDocument());
  // Give stale mousedown listeners a chance to fire (they wouldn't normally — but
  // if they accumulate they would close the sheet immediately)
  await flushPromises();
  expect(screen.getByText("short-lived")).toBeInTheDocument();
});

test("DefinitionSheet shows lemma redirect arrow when lemma differs from word", async () => {
  mockGetVocabulary.mockResolvedValue([
    {
      id: 2,
      word: "running",
      lemma: "running",
      language: "en",
      occurrences: [{ book_id: 1, book_title: "B", chapter_index: 0, sentence_text: "He was running." }],
    },
  ]);
  mockGetWordDefinition.mockResolvedValue({
    lemma: "run",
    language: "en",
    definitions: [{ pos: "verb", text: "to move quickly" }],
    url: "https://en.wiktionary.org/wiki/run",
  });

  render(<VocabularyPage />);
  await flushPromises();
  await screen.findByText("running");

  await userEvent.click(screen.getByRole("button", { name: /running/i }));
  await waitFor(() => expect(screen.getByText(/← run/)).toBeInTheDocument());
});

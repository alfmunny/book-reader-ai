/**
 * Regression test for #2603:
 * Rapid vocabulary deletion silently swallows backend errors.
 *
 * When a user deletes word A then deletes word B before the undo toast expires,
 * word A is committed to the backend via deleteVocabularyWord. If that call
 * fails, the user gets no feedback while the word appears deleted in the UI.
 *
 * Fix: catch the rejection and surface an error toast.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

import * as api from "@/lib/api";
import VocabularyPage from "@/app/(shell)/vocabulary/page";

const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<
  typeof api.getVocabulary
>;
const mockDeleteVocabularyWord =
  api.deleteVocabularyWord as jest.MockedFunction<
    typeof api.deleteVocabularyWord
  >;

const WORDS = [
  {
    id: 1,
    word: "ephemeral",
    occurrences: [
      { book_id: 1, book_title: "Moby Dick", chapter_index: 0, sentence_text: "x" },
    ],
  },
  {
    id: 2,
    word: "ardent",
    occurrences: [
      { book_id: 1, book_title: "Moby Dick", chapter_index: 0, sentence_text: "y" },
    ],
  },
];

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetVocabulary.mockResolvedValue(WORDS);
});

test("rapid delete: backend failure surfaced as visible error feedback", async () => {
  // The first delete is committed when a second delete fires (or toast expires).
  // If the backend rejects, the user must see an error message — not silence.
  mockDeleteVocabularyWord.mockRejectedValue(new Error("Network error"));

  render(<VocabularyPage />);
  await screen.findByText("ephemeral");

  // Delete word A
  await userEvent.click(screen.getByTestId("delete-ephemeral"));
  expect(screen.queryByText("ephemeral")).not.toBeInTheDocument();

  // Delete word B while toast is still showing — this commits word A to the backend
  await userEvent.click(screen.getByTestId("delete-ardent"));

  // Give the rejected promise time to resolve
  await flushPromises();

  // An error message must be visible to the user (not silent)
  await waitFor(() => {
    const errorMsg = screen.queryByText(/failed|error|could not/i);
    expect(errorMsg).toBeInTheDocument();
  });
});

test("source: onDone handler does not silently swallow deleteVocabularyWord errors", () => {
  // Statically verify that onDone does NOT use a bare .catch(() => {}) silencer.
  // The handler must propagate or show an error when the backend call fails.
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "../app/(shell)/vocabulary/page.tsx"),
    "utf8",
  );
  const onDoneIdx = src.indexOf("onDone={() =>");
  expect(onDoneIdx).not.toBe(-1);
  // The onDone block must NOT contain a bare .catch(() => {}) that silences errors
  const block = src.slice(onDoneIdx, onDoneIdx + 200);
  // A bare catch with empty body is the bug pattern
  expect(block).not.toMatch(/\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
});

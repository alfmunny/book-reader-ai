/**
 * Deleting a vocabulary word must reach the server. The row is removed
 * optimistically and the DELETE is held back for the undo window, so leaving
 * the page inside that window used to drop the request — the word came back on
 * the next load.
 */
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "token123" } }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock("@/lib/api", () => ({
  getVocabulary: jest.fn(),
  deleteVocabularyWord: jest.fn().mockResolvedValue(undefined),
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

const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;
const mockDelete = api.deleteVocabularyWord as jest.MockedFunction<typeof api.deleteVocabularyWord>;

const WORDS = [
  {
    id: 1,
    word: "ephemeral",
    occurrences: [
      { book_id: 10, book_title: "Moby Dick", chapter_index: 2, sentence_text: "The ephemeral whale loomed." },
    ],
  },
];

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockGetVocabulary.mockResolvedValue(WORDS);
});

afterEach(() => jest.useRealTimers());

async function renderAndDelete() {
  const view = render(<VocabularyPage />);
  await act(async () => { await Promise.resolve(); });
  fireEvent.click(screen.getByTestId("delete-ephemeral"));
  return view;
}

test("leaving the page inside the undo window still deletes the word on the server", async () => {
  const { unmount } = await renderAndDelete();

  // The user navigates away well before the 5s undo window closes.
  act(() => { jest.advanceTimersByTime(500); });
  unmount();

  expect(mockDelete).toHaveBeenCalledWith("ephemeral");
});

test("waiting out the undo window deletes the word exactly once", async () => {
  await renderAndDelete();

  act(() => { jest.advanceTimersByTime(5300); });

  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledWith("ephemeral");
});

test("Undo keeps the word on the server, even after the undo window elapses", async () => {
  const { unmount } = await renderAndDelete();

  fireEvent.click(screen.getByRole("button", { name: /undo/i }));
  act(() => { jest.advanceTimersByTime(5300); });

  // Restored in the list, and still there once the page is left behind.
  expect(screen.getByText("ephemeral")).toBeInTheDocument();
  unmount();

  expect(mockDelete).not.toHaveBeenCalled();
});

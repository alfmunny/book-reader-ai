/**
 * Tests for the Vocabulary Flashcards page (issue #556).
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "token" } }),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/lib/api", () => ({
  getDueFlashcards: jest.fn(),
  reviewFlashcard: jest.fn(),
  getFlashcardStats: jest.fn(),
  listDecks: jest.fn(() => Promise.resolve([])),
}));

import * as api from "@/lib/api";
import FlashcardsPage from "@/app/vocabulary/flashcards/page";

const mockGetDue = api.getDueFlashcards as jest.MockedFunction<typeof api.getDueFlashcards>;
const mockReview = api.reviewFlashcard as jest.MockedFunction<typeof api.reviewFlashcard>;
const mockStats = api.getFlashcardStats as jest.MockedFunction<typeof api.getFlashcardStats>;

const SAMPLE_CARD = {
  vocabulary_id: 1,
  word: "ephemeral",
  due_date: "2026-04-23",
  interval_days: 1,
  ease_factor: 2.5,
  repetitions: 0,
  last_reviewed_at: null,
  saved_at: "2026-04-20T10:00:00",
};

const EMPTY_STATS = { total: 0, due_today: 0, reviewed_today: 0 };
const ONE_DUE_STATS = { total: 1, due_today: 1, reviewed_today: 0 };

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
});

test("shows loading spinner initially", () => {
  mockGetDue.mockReturnValue(new Promise(() => {}));
  mockStats.mockReturnValue(new Promise(() => {}));
  render(<FlashcardsPage />);
  // spinner is present while loading
  expect(document.querySelector(".animate-spin")).toBeTruthy();
});

test("shows done state when no cards are due", async () => {
  mockGetDue.mockResolvedValue([]);
  mockStats.mockResolvedValue(EMPTY_STATS);
  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("All done for today!"));
  expect(screen.getByText(/You reviewed 0 cards/)).toBeInTheDocument();
});

test("renders card word on front face", async () => {
  mockGetDue.mockResolvedValue([SAMPLE_CARD]);
  mockStats.mockResolvedValue(ONE_DUE_STATS);
  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("ephemeral"));
  expect(screen.getByText("ephemeral")).toBeInTheDocument();
  expect(screen.getByText("Show answer")).toBeInTheDocument();
});

test("flipping card reveals grade buttons", async () => {
  mockGetDue.mockResolvedValue([SAMPLE_CARD]);
  mockStats.mockResolvedValue(ONE_DUE_STATS);
  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("ephemeral"));

  await userEvent.click(screen.getByText("Show answer"));
  expect(screen.getByText("Again")).toBeInTheDocument();
  expect(screen.getByText("Hard")).toBeInTheDocument();
  expect(screen.getByText("Good")).toBeInTheDocument();
  expect(screen.getByText("Easy")).toBeInTheDocument();
});

test("grading a card calls reviewFlashcard and advances", async () => {
  mockGetDue.mockResolvedValue([SAMPLE_CARD]);
  mockStats.mockResolvedValue(ONE_DUE_STATS);
  mockReview.mockResolvedValue({
    vocabulary_id: 1,
    interval_days: 1,
    ease_factor: 2.36,
    repetitions: 1,
    next_due: "2026-04-24",
  });
  mockStats.mockResolvedValueOnce(ONE_DUE_STATS).mockResolvedValue({ total: 1, due_today: 0, reviewed_today: 1 });

  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("ephemeral"));

  await userEvent.click(screen.getByText("Show answer"));
  await userEvent.click(screen.getByText("Good"));

  await waitFor(() => screen.getByText("All done for today!"));
  expect(mockReview).toHaveBeenCalledWith(1, 3);
});

test("back button navigates to vocabulary page", async () => {
  mockGetDue.mockResolvedValue([]);
  mockStats.mockResolvedValue(EMPTY_STATS);
  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("All done for today!"));

  await userEvent.click(screen.getByText("Back to Vocabulary"));
  expect(mockPush).toHaveBeenCalledWith("/vocabulary");
});

test("shows progress bar", async () => {
  mockGetDue.mockResolvedValue([SAMPLE_CARD]);
  mockStats.mockResolvedValue({ total: 1, due_today: 1, reviewed_today: 0 });
  render(<FlashcardsPage />);
  await waitFor(() => screen.getByText("ephemeral"));

  expect(screen.getByText("0 / 1 today")).toBeInTheDocument();
});

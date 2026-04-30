/**
 * Regression test for #2507:
 * When grading a flashcard (not the last one), the grade buttons unmount and the
 * next card renders. Focus must move to the new card's "Show answer" button so
 * keyboard users don't lose their position (WCAG 2.4.3 Focus Order).
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "token" } }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
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

const CARD_A = {
  vocabulary_id: 1,
  word: "ephemeral",
  due_date: "2026-04-30",
  interval_days: 1,
  ease_factor: 2.5,
  repetitions: 0,
  last_reviewed_at: null,
  saved_at: "2026-04-28T10:00:00",
};
const CARD_B = {
  vocabulary_id: 2,
  word: "transient",
  due_date: "2026-04-30",
  interval_days: 1,
  ease_factor: 2.5,
  repetitions: 0,
  last_reviewed_at: null,
  saved_at: "2026-04-28T10:00:00",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockReview.mockResolvedValue({
    vocabulary_id: 1,
    interval_days: 1,
    ease_factor: 2.36,
    repetitions: 1,
    next_due: "2026-05-01",
  });
  mockStats.mockResolvedValue({ total: 2, due_today: 2, reviewed_today: 0 });
});

describe("Flashcard card-to-card transition focus management (closes #2507)", () => {
  it("moves focus to Show answer button after grading a non-last card", async () => {
    mockGetDue.mockResolvedValue([CARD_A, CARD_B]);

    render(<FlashcardsPage />);

    // Wait for first card
    await waitFor(() => screen.getAllByText("ephemeral")[0]);

    // Flip the card
    await userEvent.click(screen.getByRole("button", { name: /show answer/i }));

    // Grade it — not the last card
    await userEvent.click(screen.getByRole("button", { name: /good/i }));

    // Second card should appear
    await waitFor(() => screen.getAllByText("transient")[0]);

    // Focus must be on the "Show answer" button for the next card
    const showAnswerBtn = screen.getByRole("button", { name: /show answer/i });
    expect(document.activeElement).toBe(showAnswerBtn);
  });
});

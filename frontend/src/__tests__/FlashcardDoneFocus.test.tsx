/**
 * Regression test for #2501:
 * When the last flashcard is graded and the "All done for today!" state appears,
 * focus must move into that container so keyboard/screen-reader users don't lose
 * their position (WCAG 2.4.3 Focus Order).
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

const CARD = {
  vocabulary_id: 42,
  word: "ephemeral",
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
    vocabulary_id: 42,
    interval_days: 1,
    ease_factor: 2.36,
    repetitions: 1,
    next_due: "2026-05-01",
  });
});

describe("Flashcard done-state focus management (closes #2501)", () => {
  it("moves focus to the done-state container after grading the last card", async () => {
    mockGetDue.mockResolvedValue([CARD]);
    mockStats
      .mockResolvedValueOnce({ total: 1, due_today: 1, reviewed_today: 0 })
      .mockResolvedValue({ total: 1, due_today: 0, reviewed_today: 1 });

    render(<FlashcardsPage />);

    // Wait for card to render
    await waitFor(() => screen.getAllByText("ephemeral")[0]);

    // Flip the card
    await userEvent.click(screen.getByText("Show answer"));

    // Grade it "Good" — this is the last card
    await userEvent.click(screen.getByText("Good"));

    // Done state should appear
    await waitFor(() => screen.getByText("All done for today!"));

    // Focus must be inside the done-state container (not body or a removed button)
    const doneContainer = screen.getByText("All done for today!").closest("[tabindex]");
    expect(doneContainer).not.toBeNull();
    expect(document.activeElement).toBe(doneContainer);
  });

  it("done-state container is focusable (tabIndex=-1)", async () => {
    mockGetDue.mockResolvedValue([]);
    mockStats.mockResolvedValue({ total: 0, due_today: 0, reviewed_today: 0 });

    render(<FlashcardsPage />);

    await waitFor(() => screen.getByText("All done for today!"));

    const heading = screen.getByText("All done for today!");
    // The heading should be inside a tabIndex=-1 container
    const container = heading.closest("[tabindex='-1']");
    expect(container).not.toBeNull();
  });
});

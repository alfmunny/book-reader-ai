/**
 * Regression tests for issue #2412:
 * ReadingStats silently returned null on fetch failure — no error state or retry button.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ReadingStats from "@/components/ReadingStats";

const mockGetUserStats = jest.fn();

jest.mock("@/lib/api", () => ({
  getUserStats: (...args: unknown[]) => mockGetUserStats(...args),
}));

const HAPPY_STATS = {
  streak: 3,
  longest_streak: 7,
  activity: [{ date: "2026-04-30", count: 2 }],
  totals: { books_started: 5, vocabulary_words: 42, annotations: 11, insights: 3 },
};

beforeEach(() => jest.clearAllMocks());

describe("ReadingStats — fetch failure (issue #2412)", () => {
  it("renders an error message instead of returning null when getUserStats rejects", async () => {
    mockGetUserStats.mockRejectedValue(new Error("Network error"));

    render(<ReadingStats active={true} />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
      const status = screen.getByRole("status");
      // Should NOT be the loading skeleton (which also has role="status" but has animate-pulse)
      expect(status.className).not.toContain("animate-pulse");
    });

    // Should show an error message
    expect(screen.getByText(/couldn't load|failed|error|try again/i)).toBeInTheDocument();
  });

  it("shows a retry button that re-fetches when clicked", async () => {
    mockGetUserStats.mockRejectedValueOnce(new Error("Network error"));
    mockGetUserStats.mockResolvedValueOnce(HAPPY_STATS);

    render(<ReadingStats active={true} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument()
    );

    // After successful retry, the stats content should appear
    await waitFor(() =>
      expect(screen.getAllByText(/reading streak|activity/i).length).toBeGreaterThan(0)
    );

    expect(mockGetUserStats).toHaveBeenCalledTimes(2);
  });

  it("renders the happy path normally when stats load successfully", async () => {
    mockGetUserStats.mockResolvedValue(HAPPY_STATS);

    render(<ReadingStats active={true} />);

    await waitFor(() =>
      expect(screen.getByText(/reading streak/i)).toBeInTheDocument()
    );

    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("does not call getUserStats when active=false", async () => {
    render(<ReadingStats active={false} />);
    await act(async () => {});
    expect(mockGetUserStats).not.toHaveBeenCalled();
  });
});

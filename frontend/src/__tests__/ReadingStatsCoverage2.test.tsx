/**
 * Coverage tests for components/ReadingStats.tsx — functions not covered by existing tests.
 * Closes #1991 — targets:
 *   intensityClass count > 10 branch (lines 56-57)
 *   .catch(() => {}) on getUserStats rejection (line 93)
 */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import ReadingStats from "@/components/ReadingStats";

jest.mock("@/lib/api", () => ({
  getUserStats: jest.fn(),
}));

import { getUserStats } from "@/lib/api";
const mockGetStats = getUserStats as jest.Mock;

test("getUserStats rejection is silently swallowed — loading resolves without throw", async () => {
  mockGetStats.mockRejectedValue(new Error("Network failure"));
  const { container } = render(<ReadingStats active={true} />);
  // After rejection the loading spinner disappears (finally sets loading=false)
  await waitFor(() => {
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
  });
});

test("activity cell with count > 10 renders with darkest heat class (bg-amber-800)", async () => {
  mockGetStats.mockResolvedValue({
    totals: { books_started: 1, vocabulary_words: 0, annotations: 0, insights: 0 },
    streak: 0,
    longest_streak: 0,
    activity: [{ date: "2026-04-28", count: 15 }],
  });

  const { container } = render(<ReadingStats active={true} />);

  await waitFor(() => {
    const darkCell = container.querySelector(".bg-amber-800");
    expect(darkCell).toBeInTheDocument();
  });
});

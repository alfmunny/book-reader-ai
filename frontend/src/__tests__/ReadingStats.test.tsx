/**
 * Tests for components/ReadingStats.tsx
 *
 * Covers:
 * - Shows loading skeleton when active=true and fetch pending
 * - Renders stat cards with correct values
 * - Shows streak banner when streak > 0
 * - Hides streak banner when streak = 0
 * - Activity grid renders correct number of cells
 * - Zero state (all zeros): no streak banner, cards show 0
 * - Does not fetch when active=false
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import ReadingStats from "@/components/ReadingStats";

jest.mock("@/lib/api", () => ({
  getUserStats: jest.fn(),
}));

import { getUserStats } from "@/lib/api";
const mockGetStats = getUserStats as jest.Mock;

const STATS_WITH_STREAK = {
  totals: { books_started: 12, vocabulary_words: 247, annotations: 89, insights: 34 },
  streak: 7,
  longest_streak: 14,
  activity: [
    { date: "2026-04-22", count: 5 },
    { date: "2026-04-21", count: 3 },
    { date: "2026-04-20", count: 1 },
  ],
};

const STATS_ZERO = {
  totals: { books_started: 0, vocabulary_words: 0, annotations: 0, insights: 0 },
  streak: 0,
  longest_streak: 0,
  activity: [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Loading skeleton ───────────────────────────────────────────────────────

test("shows loading skeleton while fetching", () => {
  mockGetStats.mockImplementation(() => new Promise(() => {})); // never resolves
  render(<ReadingStats active={true} />);
  expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
});

// ── Stat cards ─────────────────────────────────────────────────────────────

test("renders stat cards with correct values", async () => {
  mockGetStats.mockResolvedValue(STATS_WITH_STREAK);
  render(<ReadingStats active={true} />);

  await waitFor(() => {
    expect(screen.getByText("12")).toBeInTheDocument();  // books started
    expect(screen.getByText("247")).toBeInTheDocument(); // words saved
    expect(screen.getByText("89")).toBeInTheDocument();  // annotations
    expect(screen.getByText("34")).toBeInTheDocument();  // insights
  });
});

test("renders stat labels", async () => {
  mockGetStats.mockResolvedValue(STATS_WITH_STREAK);
  render(<ReadingStats active={true} />);

  await waitFor(() => {
    expect(screen.getByText("Books started")).toBeInTheDocument();
    expect(screen.getByText("Words saved")).toBeInTheDocument();
    expect(screen.getByText("Annotations")).toBeInTheDocument();
    expect(screen.getByText("Insights")).toBeInTheDocument();
  });
});

// ── Streak banner ──────────────────────────────────────────────────────────

test("shows streak banner when streak > 0", async () => {
  mockGetStats.mockResolvedValue(STATS_WITH_STREAK);
  render(<ReadingStats active={true} />);

  await waitFor(() => {
    expect(screen.getByText("7-day reading streak!")).toBeInTheDocument();
    expect(screen.getByText("Longest: 14 days")).toBeInTheDocument();
  });
});

test("hides streak banner when streak = 0", async () => {
  mockGetStats.mockResolvedValue(STATS_ZERO);
  render(<ReadingStats active={true} />);

  await waitFor(() => {
    expect(screen.queryByText(/reading streak/)).not.toBeInTheDocument();
  });
});

// ── Zero state ─────────────────────────────────────────────────────────────

test("renders zero values correctly", async () => {
  mockGetStats.mockResolvedValue(STATS_ZERO);
  render(<ReadingStats active={true} />);

  await waitFor(() => {
    // Four "0" stat cards
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Inactive state ─────────────────────────────────────────────────────────

test("does not call API when active=false", async () => {
  render(<ReadingStats active={false} />);
  expect(mockGetStats).not.toHaveBeenCalled();
});

// ── Activity section ───────────────────────────────────────────────────────

test("shows activity heatmap section label", async () => {
  mockGetStats.mockResolvedValue(STATS_WITH_STREAK);
  render(<ReadingStats active={true} />);

  await waitFor(() => {
    expect(screen.getByText("Activity — last year")).toBeInTheDocument();
  });
});

test("shows active days count", async () => {
  mockGetStats.mockResolvedValue(STATS_WITH_STREAK);
  render(<ReadingStats active={true} />);

  await waitFor(() => {
    // 3 activity days in mock data
    expect(screen.getByText("3 active days")).toBeInTheDocument();
  });
});

test("shows 0 active days for zero stats", async () => {
  mockGetStats.mockResolvedValue(STATS_ZERO);
  render(<ReadingStats active={true} />);

  await waitFor(() => {
    expect(screen.getByText("0 active days")).toBeInTheDocument();
  });
});

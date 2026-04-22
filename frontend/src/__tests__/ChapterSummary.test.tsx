/**
 * Tests for components/ChapterSummary.tsx
 *
 * Covers:
 * - Auto-loads on first render when isVisible=true
 * - Shows loading skeleton while fetching
 * - Renders markdown summary on success
 * - Shows cached badge for cached responses
 * - Shows error message on failure
 * - Refresh button calls API again
 * - Resets when chapterIndex changes
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChapterSummary from "@/components/ChapterSummary";

jest.mock("@/lib/api", () => ({
  generateChapterSummary: jest.fn(),
}));

import { generateChapterSummary } from "@/lib/api";
const mockGenerate = generateChapterSummary as jest.Mock;

const DEFAULT_PROPS = {
  bookId: "2600",
  chapterIndex: 3,
  chapterText: "Prince Andrei lay on his back on the hillside.",
  chapterTitle: "Chapter III",
  bookTitle: "War and Peace",
  author: "Leo Tolstoy",
  isVisible: true,
};

const SUMMARY = "**Overview**\nPrince Andrei is wounded at Austerlitz.\n\n**Key Events**\n- He falls on the battlefield.";

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Auto-load ──────────────────────────────────────────────────────────────

test("auto-loads summary when isVisible=true", async () => {
  mockGenerate.mockResolvedValue({ summary: SUMMARY, cached: false });

  render(<ChapterSummary {...DEFAULT_PROPS} />);

  // Loading skeleton appears first
  expect(document.querySelector(".animate-pulse")).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText(/Prince Andrei is wounded/)).toBeInTheDocument();
  });

  expect(mockGenerate).toHaveBeenCalledTimes(1);
  expect(mockGenerate).toHaveBeenCalledWith(
    2600, 3,
    DEFAULT_PROPS.chapterText,
    DEFAULT_PROPS.bookTitle,
    DEFAULT_PROPS.author,
    DEFAULT_PROPS.chapterTitle,
  );
});

test("does not auto-load when isVisible=false", async () => {
  render(<ChapterSummary {...DEFAULT_PROPS} isVisible={false} />);

  // Give it a tick to ensure no call was made
  await act(async () => { await new Promise(r => setTimeout(r, 50)); });
  expect(mockGenerate).not.toHaveBeenCalled();
});

// ── Cached badge ───────────────────────────────────────────────────────────

test("shows cached badge for cached responses", async () => {
  mockGenerate.mockResolvedValue({ summary: SUMMARY, cached: true, model: "gemini-flash" });

  render(<ChapterSummary {...DEFAULT_PROPS} />);

  await waitFor(() => {
    expect(screen.getByText("cached")).toBeInTheDocument();
  });
});

test("does not show cached badge for fresh responses", async () => {
  mockGenerate.mockResolvedValue({ summary: SUMMARY, cached: false });

  render(<ChapterSummary {...DEFAULT_PROPS} />);

  await waitFor(() => {
    expect(screen.queryByText("cached")).not.toBeInTheDocument();
  });
});

// ── Error state ────────────────────────────────────────────────────────────

test("shows error message on API failure", async () => {
  mockGenerate.mockRejectedValue(new Error("500 internal server error"));

  render(<ChapterSummary {...DEFAULT_PROPS} />);

  await waitFor(() => {
    expect(screen.getByText(/Could not generate summary/)).toBeInTheDocument();
    expect(screen.getByText(/Failed to generate summary/)).toBeInTheDocument();
  });
});

test("shows 503 message when service is not configured", async () => {
  mockGenerate.mockRejectedValue(new Error("503 service unavailable"));

  render(<ChapterSummary {...DEFAULT_PROPS} />);

  await waitFor(() => {
    expect(screen.getByText(/not available/)).toBeInTheDocument();
  });
});

// ── Refresh button ─────────────────────────────────────────────────────────

test("refresh button calls API again", async () => {
  mockGenerate.mockResolvedValue({ summary: SUMMARY, cached: true });

  render(<ChapterSummary {...DEFAULT_PROPS} />);

  await waitFor(() => {
    expect(screen.getByText(/Prince Andrei is wounded/)).toBeInTheDocument();
  });

  expect(mockGenerate).toHaveBeenCalledTimes(1);

  const refreshBtn = screen.getByTitle("Regenerate summary");
  await userEvent.click(refreshBtn);

  await waitFor(() => {
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });
});

// ── Chapter navigation reset ───────────────────────────────────────────────

test("resets summary when chapterIndex changes", async () => {
  mockGenerate.mockResolvedValue({ summary: SUMMARY, cached: false });

  const { rerender } = render(<ChapterSummary {...DEFAULT_PROPS} />);

  await waitFor(() => {
    expect(screen.getByText(/Prince Andrei is wounded/)).toBeInTheDocument();
  });

  // Navigate to a different chapter
  rerender(<ChapterSummary {...DEFAULT_PROPS} chapterIndex={4} />);

  // Summary should be gone (reset), Generate button appears
  await waitFor(() => {
    expect(screen.queryByText(/Prince Andrei is wounded/)).not.toBeInTheDocument();
  });
});

// ── Stale response guard ───────────────────────────────────────────────────

test("stale chapter response does not overwrite the correct summary on fast navigation", async () => {
  // ch3Promise resolves slowly (simulates an in-flight Gemini call for chapter 3)
  let resolveCh3!: (v: { summary: string; cached: boolean }) => void;
  const ch3Promise = new Promise<{ summary: string; cached: boolean }>(
    (res) => { resolveCh3 = res; }
  );
  // ch4 resolves immediately when called
  const ch4Result = { summary: "Chapter 4 summary text", cached: false };

  mockGenerate
    .mockImplementationOnce(() => ch3Promise)  // first call: chapter 3
    .mockResolvedValueOnce(ch4Result);          // second call: chapter 4

  const { rerender } = render(<ChapterSummary {...DEFAULT_PROPS} chapterIndex={3} />);

  // Chapter 3 load is in flight; navigate to chapter 4.
  // The chapterIndex effect resets loading=false and bumps the generation counter,
  // which allows chapter 4's auto-load to start and invalidates chapter 3's response.
  rerender(<ChapterSummary {...DEFAULT_PROPS} chapterIndex={4} />);

  // Chapter 4 summary loads correctly (after the chapterIndex reset unblocks auto-load)
  await waitFor(() => {
    expect(screen.getByText(/Chapter 4 summary text/)).toBeInTheDocument();
  });

  // Now resolve the stale chapter 3 response — generation counter discards it
  await act(async () => {
    resolveCh3({ summary: "Chapter 3 stale summary", cached: false });
    await new Promise(r => setTimeout(r, 0));
  });

  // Chapter 3's stale content must NOT appear
  expect(screen.queryByText(/Chapter 3 stale summary/)).not.toBeInTheDocument();
  expect(screen.getByText(/Chapter 4 summary text/)).toBeInTheDocument();
  // API called exactly twice (once per chapter)
  expect(mockGenerate).toHaveBeenCalledTimes(2);
});

// ── Empty state ────────────────────────────────────────────────────────────

test("shows generate button when not yet loaded and not visible", async () => {
  render(<ChapterSummary {...DEFAULT_PROPS} isVisible={false} />);

  // No auto-load → shows empty state prompt
  await act(async () => { await new Promise(r => setTimeout(r, 50)); });
  expect(screen.getByText("Generate Summary")).toBeInTheDocument();
});

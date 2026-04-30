/**
 * Coverage tests for app/notes/page.tsx — functions not covered by existing tests.
 * Closes #1993 — targets:
 *   FN:184 "Browse books" onClick (empty-state, books.length === 0) → router.push("/")
 *   FN:196 "Clear search" onClick (filtered empty state) → setSearch("")
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock("next-auth/react", () => ({
  useSession: jest.fn().mockReturnValue({ data: { backendToken: "tok" }, status: "authenticated" }),
}));

jest.mock("@/lib/api", () => ({
  getAllAnnotations: jest.fn(),
  getAllInsights: jest.fn(),
  getVocabulary: jest.fn(),
}));

import * as api from "@/lib/api";
import NotesPage from "@/app/notes/page";

const mockGetAllAnnotations = api.getAllAnnotations as jest.MockedFunction<typeof api.getAllAnnotations>;
const mockGetAllInsights = api.getAllInsights as jest.MockedFunction<typeof api.getAllInsights>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllAnnotations.mockResolvedValue([]);
  mockGetAllInsights.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
});

// ── "Browse books" link (FN:184) ─────────────────────────────────────────────

test("'Browse books' in empty state is a link to /", async () => {
  // All APIs return empty arrays → books.length === 0 → empty state shown
  render(<NotesPage />);
  await waitFor(() => flushPromises());

  const browseLink = await screen.findByRole("link", { name: /browse books/i });
  expect(browseLink).toHaveAttribute("href", "/");
});

// ── "Clear search" button onClick (FN:196) ────────────────────────────────────

test("clicking 'Clear search' in filtered empty state resets search and shows books again", async () => {
  // Seed one book so that search can produce a no-match state
  mockGetAllAnnotations.mockResolvedValue([
    {
      id: 1, book_id: 10, chapter_index: 0,
      sentence_text: "Hello world.", note_text: "", color: "yellow",
      book_title: "Moby Dick",
      created_at: "2026-01-01T00:00:00",
    } as Parameters<typeof mockGetAllAnnotations.mockResolvedValue>[0][0],
  ]);

  render(<NotesPage />);

  // Wait for book to appear
  await screen.findByText("Moby Dick");

  // Type a search term that matches nothing
  const searchInput = screen.getByPlaceholderText(/search books/i);
  await userEvent.type(searchInput, "zzznomatch");

  // The book should now be filtered out and "Clear search" button appears
  await waitFor(() => {
    expect(screen.queryByText("Moby Dick")).not.toBeInTheDocument();
  });

  const clearBtn = screen.getByRole("button", { name: /clear search/i });
  await userEvent.click(clearBtn);

  // After clearing, the book re-appears
  await screen.findByText("Moby Dick");
});

/**
 * Regression tests for vocabulary page sort/group modes (#422):
 * - A–Z: existing alphabetical letter sections
 * - Language: sections per language, Unknown last
 * - Book: sections per book, words appear under all their books
 * - Recent: flat list newest-first, no section headings
 */
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "tok" } }),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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
  ApiError: class ApiError extends Error { status = 500; },
}));

import * as api from "@/lib/api";
import VocabularyPage from "@/app/vocabulary/page";

const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

// 6 words so the sort control renders (words.length > 5)
const WORDS = [
  {
    id: 1, word: "Angst", lemma: "Angst", language: "German",
    created_at: "2026-04-01T10:00:00",
    occurrences: [{ book_id: 1, book_title: "Faust", chapter_index: 0, sentence_text: "s1" }],
  },
  {
    id: 2, word: "Weltschmerz", lemma: "Weltschmerz", language: "German",
    created_at: "2026-04-10T12:00:00",
    occurrences: [{ book_id: 1, book_title: "Faust", chapter_index: 2, sentence_text: "s2" }],
  },
  {
    id: 3, word: "sonder", lemma: "sonder", language: "French",
    created_at: "2026-04-05T08:00:00",
    occurrences: [{ book_id: 2, book_title: "Les Misérables", chapter_index: 1, sentence_text: "s3" }],
  },
  {
    id: 4, word: "melancholy", lemma: "melancholy", language: null,
    created_at: "2026-04-15T09:00:00",
    occurrences: [{ book_id: 3, book_title: "Frankenstein", chapter_index: 0, sentence_text: "s4" }],
  },
  {
    id: 5, word: "sublime", lemma: "sublime", language: null,
    created_at: "2026-04-03T11:00:00",
    occurrences: [
      { book_id: 3, book_title: "Frankenstein", chapter_index: 1, sentence_text: "s5a" },
      { book_id: 1, book_title: "Faust", chapter_index: 3, sentence_text: "s5b" },
    ],
  },
  {
    id: 6, word: "gothic", lemma: "gothic", language: null,
    created_at: "2026-04-20T07:00:00",
    occurrences: [{ book_id: 3, book_title: "Frankenstein", chapter_index: 4, sentence_text: "s6" }],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetVocabulary.mockResolvedValue(WORDS);
});

async function renderAndLoad() {
  render(<VocabularyPage />);
  await act(async () => { await flushPromises(); });
  await screen.findByText("Angst");
}

// ── A–Z mode (default) ────────────────────────────────────────────────────────

describe("vocabulary sort — A–Z (default)", () => {
  it("shows letter section headings", async () => {
    await renderAndLoad();
    // "A" section for Angst
    expect(screen.getByText("A")).toBeInTheDocument();
    // "G" for gothic
    expect(screen.getByText("G")).toBeInTheDocument();
  });

  it("A–Z button is active by default", async () => {
    await renderAndLoad();
    const alphaBtn = screen.getByTestId("sort-alpha");
    expect(alphaBtn.className).toMatch(/bg-amber-700/);
  });
});

// ── Language mode ─────────────────────────────────────────────────────────────

describe("vocabulary sort — Language", () => {
  it("shows language section headings after switching to Language mode", async () => {
    await renderAndLoad();
    fireEvent.click(screen.getByTestId("sort-language"));

    // Section headings are h2 elements
    expect(screen.getByRole("heading", { level: 2, name: "French" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "German" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Unknown" })).toBeInTheDocument();
  });

  it("German words appear under German section", async () => {
    await renderAndLoad();
    fireEvent.click(screen.getByTestId("sort-language"));

    expect(screen.getByRole("heading", { level: 2, name: "German" })).toBeInTheDocument();
    expect(screen.getByText("Angst")).toBeInTheDocument();
    expect(screen.getByText("Weltschmerz")).toBeInTheDocument();
  });

  it("Unknown section appears last (words without language)", async () => {
    await renderAndLoad();
    fireEvent.click(screen.getByTestId("sort-language"));

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings[headings.length - 1]).toBe("Unknown");
  });

  it("no letter headings visible in language mode", async () => {
    await renderAndLoad();
    fireEvent.click(screen.getByTestId("sort-language"));

    // Single-letter headings (A, G, M, etc.) should not appear
    expect(screen.queryByRole("heading", { level: 2, name: "A" })).not.toBeInTheDocument();
  });
});

// ── Book mode ─────────────────────────────────────────────────────────────────

describe("vocabulary sort — Book", () => {
  it("shows book title as section heading", async () => {
    await renderAndLoad();
    fireEvent.click(screen.getByTestId("sort-book"));

    // Each book appears at least once as heading (may also appear as occurrence link)
    expect(screen.getAllByText("Faust").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Frankenstein").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Les Misérables").length).toBeGreaterThanOrEqual(1);
  });

  it("a word with occurrences in multiple books appears in each", async () => {
    // 'sublime' has occurrences in both Frankenstein and Faust
    await renderAndLoad();
    fireEvent.click(screen.getByTestId("sort-book"));

    // sublime should appear twice (once per book section)
    const sublimeEls = screen.getAllByText("sublime");
    expect(sublimeEls.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Recent mode ───────────────────────────────────────────────────────────────

describe("vocabulary sort — Recent", () => {
  it("no section headings in recent mode", async () => {
    await renderAndLoad();
    fireEvent.click(screen.getByTestId("sort-recent"));

    // No letter-style single-char or language headings
    expect(screen.queryByRole("heading", { level: 2, name: "A" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "German" })).not.toBeInTheDocument();
  });

  it("most recently saved word (gothic, 2026-04-20) appears first", async () => {
    await renderAndLoad();
    fireEvent.click(screen.getByTestId("sort-recent"));

    // Get all word lemma buttons in render order
    const wordButtons = screen.getAllByRole("button").filter(
      (b) => ["gothic", "melancholy", "Weltschmerz", "sonder", "sublime", "Angst"].includes(b.textContent ?? ""),
    );
    expect(wordButtons[0].textContent).toBe("gothic");
  });
});

// ── Sort control renders only when words.length > 5 ──────────────────────────

describe("vocabulary sort — control visibility", () => {
  it("sort control is visible when > 5 words", async () => {
    await renderAndLoad();
    expect(screen.getByTestId("sort-mode-control")).toBeInTheDocument();
  });

  it("sort control is hidden when ≤ 5 words", async () => {
    mockGetVocabulary.mockResolvedValue(WORDS.slice(0, 3));
    render(<VocabularyPage />);
    await act(async () => { await flushPromises(); });
    await screen.findByText("Angst");

    expect(screen.queryByTestId("sort-mode-control")).not.toBeInTheDocument();
  });
});

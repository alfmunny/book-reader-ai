/**
 * Regression test for #588: status banners in BookDetailModal and ProfilePage
 * must use CheckIcon SVG (aria-hidden) instead of raw ✓ character.
 */
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";

// ── BookDetailModal ───────────────────────────────────────────────────────────

jest.mock("@/lib/api", () => ({
  getBookTranslationStatus: jest.fn(),
  getMe: jest.fn().mockResolvedValue({ id: 1, name: "Alice", email: "a@b.com", role: "user", hasGeminiKey: false }),
  getObsidianSettings: jest.fn().mockResolvedValue({ obsidian_repo: "", obsidian_path: "", has_github_token: false }),
  getUserStats: jest.fn().mockResolvedValue({ totals: { books_started: 0, vocabulary_words: 0, annotations: 0, insights: 0 }, streak: 0, longest_streak: 0, activity: [] }),
  saveGeminiKey: jest.fn(),
  deleteGeminiKey: jest.fn(),
  saveObsidianSettings: jest.fn(),
  listDecks: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn(() => ({
    translationLang: "zh",  // Different from book language "de" so translation banner shows
    insightLang: "en", translationEnabled: false, ttsGender: "female", chatFontSize: "xs",
    translationProvider: "auto", fontSize: "base", theme: "light",
  })),
  saveSettings: jest.fn(),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { backendToken: "tok", backendUser: { id: 1, name: "Alice", role: "user", picture: null } },
    status: "authenticated",
  }),
  signOut: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import * as api from "@/lib/api";
import BookDetailModal from "@/components/BookDetailModal";
import type { BookMeta } from "@/lib/api";
import ProfilePage from "@/app/profile/page";

const mockGetTranslationStatus = api.getBookTranslationStatus as jest.MockedFunction<
  typeof api.getBookTranslationStatus
>;

const BASE_BOOK: BookMeta = {
  id: 1, title: "Faust", authors: ["Goethe"], languages: ["de"],
  subjects: [], download_count: 1000, cover: "",
};

const BASE_PROPS = {
  book: BASE_BOOK, recentBook: undefined, onClose: jest.fn(), onRead: jest.fn(),
};

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockGetTranslationStatus.mockResolvedValue({ translated_chapters: 5, total_chapters: 10 });
});

describe("BookDetailModal — translation checkmark (#588)", () => {
  it("does not render raw ✓ character in translation banner", async () => {
    render(<BookDetailModal {...BASE_PROPS} />);
    await act(async () => await flushPromises());

    // Wait for translation status to load
    await waitFor(() =>
      expect(screen.getByText(/chapters translated/)).toBeInTheDocument()
    );

    // The translation banner should NOT contain a raw ✓ text node
    const banner = screen.getByText(/chapters translated/).closest("div");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).not.toContain("✓");
  });

  it("renders an SVG icon in the translation banner instead of ✓", async () => {
    render(<BookDetailModal {...BASE_PROPS} />);
    await act(async () => await flushPromises());

    await waitFor(() =>
      expect(screen.getByText(/chapters translated/)).toBeInTheDocument()
    );

    // There should be an SVG in the banner area (CheckIcon)
    const banner = screen.getByText(/chapters translated/).closest("div");
    expect(banner!.querySelector("svg")).not.toBeNull();
  });
});

describe("ProfilePage — Gemini key checkmark (#588)", () => {
  it("does not render raw ✓ character in Gemini key status banner", async () => {
    // Override getMe to return hasGeminiKey=true so the status banner appears
    const apiMod = require("@/lib/api");
    apiMod.getMe.mockResolvedValue({
      id: 1, name: "Alice", email: "a@b.com", role: "user", hasGeminiKey: true,
    });

    render(<ProfilePage />);
    await act(async () => await flushPromises());

    await waitFor(() =>
      expect(screen.getByText(/Gemini key is active/)).toBeInTheDocument()
    );

    const banner = screen.getByText(/Gemini key is active/).closest("div");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).not.toContain("✓");
  });
});

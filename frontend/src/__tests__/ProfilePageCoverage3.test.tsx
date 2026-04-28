/**
 * Coverage tests for app/profile/page.tsx — functions not covered by existing tests.
 * Closes #1985 — targets: gotoFlashcardsForDeck, handleRemoveObsidianToken success/error.
 *
 * Root causes for gaps:
 *  - gotoFlashcardsForDeck: existing tests mock listDecks with [] so the Study decks
 *    section never renders and the function is never called
 *  - handleRemoveObsidianToken: existing tests mock getObsidianSettings without
 *    has_github_token:true so the Remove button never renders
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: jest.fn().mockReturnValue({
    data: { backendToken: "test-token", backendUser: { name: "Test" } },
  }),
  signOut: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: jest.fn().mockReturnValue({ push: (...args: unknown[]) => mockPush(...args) }),
}));

jest.mock("@/lib/api", () => ({
  saveGeminiKey: jest.fn().mockResolvedValue({}),
  deleteGeminiKey: jest.fn().mockResolvedValue({}),
  getMe: jest.fn().mockResolvedValue({ hasGeminiKey: false, role: "user" }),
  getObsidianSettings: jest.fn().mockResolvedValue({
    obsidian_repo: "user/vault",
    obsidian_path: "Notes/Books",
    has_github_token: false,
  }),
  saveObsidianSettings: jest.fn().mockResolvedValue({}),
  listDecks: jest.fn().mockResolvedValue([]),
  getUserStats: jest.fn().mockResolvedValue({
    totals: { books_started: 0, vocabulary_words: 0, annotations: 0, insights: 0 },
    streak: 0,
    longest_streak: 0,
    activity: [],
  }),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn().mockReturnValue({
    insightLang: "en",
    translationLang: "de",
    translationEnabled: false,
    ttsGender: "female",
    chatFontSize: "xs",
    translationProvider: "auto",
    fontSize: "base",
    theme: "light",
  }),
  saveSettings: jest.fn(),
}));

import * as api from "@/lib/api";
import ProfilePage from "@/app/profile/page";

const mockListDecks = api.listDecks as jest.MockedFunction<typeof api.listDecks>;
const mockGetObsidianSettings = api.getObsidianSettings as jest.MockedFunction<typeof api.getObsidianSettings>;
const mockSaveObsidianSettings = api.saveObsidianSettings as jest.MockedFunction<typeof api.saveObsidianSettings>;

const DUE_DECK = {
  id: 5,
  name: "German verbs",
  description: "",
  mode: "manual" as const,
  rules_json: null,
  created_at: "",
  updated_at: "",
  member_count: 10,
  due_today: 3,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListDecks.mockResolvedValue([]);
  mockGetObsidianSettings.mockResolvedValue({
    obsidian_repo: "user/vault",
    obsidian_path: "Notes/Books",
    has_github_token: false,
  });
  mockSaveObsidianSettings.mockResolvedValue({});
});

// ── gotoFlashcardsForDeck ─────────────────────────────────────────────────────

test("clicking a due deck row navigates to /vocabulary/flashcards", async () => {
  mockListDecks.mockResolvedValue([DUE_DECK]);
  render(<ProfilePage />);

  await waitFor(() => screen.getByText("German verbs"));

  await userEvent.click(screen.getByRole("button", {
    name: /Review 3 due cards? in German verbs/i,
  }));

  expect(mockPush).toHaveBeenCalledWith("/vocabulary/flashcards");
});

test("clicking a due deck row persists lastDeckId to localStorage", async () => {
  mockListDecks.mockResolvedValue([DUE_DECK]);
  const setItemSpy = jest.spyOn(Storage.prototype, "setItem");
  render(<ProfilePage />);

  await waitFor(() => screen.getByText("German verbs"));

  await userEvent.click(screen.getByRole("button", {
    name: /Review 3 due cards? in German verbs/i,
  }));

  expect(setItemSpy).toHaveBeenCalledWith("flashcards.lastDeckId", "5");
  setItemSpy.mockRestore();
});

test("due deck section does not render when no decks have due_today > 0", async () => {
  mockListDecks.mockResolvedValue([{ ...DUE_DECK, due_today: 0 }]);
  render(<ProfilePage />);
  await waitFor(() => expect(api.listDecks).toHaveBeenCalled());
  expect(screen.queryByText("Study decks")).not.toBeInTheDocument();
});

// ── handleRemoveObsidianToken — success ───────────────────────────────────────

test("Remove token button calls saveObsidianSettings with github_token empty string", async () => {
  mockGetObsidianSettings.mockResolvedValue({
    obsidian_repo: "user/vault",
    obsidian_path: "Notes/Books",
    has_github_token: true,
  });

  render(<ProfilePage />);

  // Open the Obsidian collapsible
  await waitFor(() => screen.getByRole("button", { name: /Obsidian Export/i }));
  fireEvent.click(screen.getByRole("button", { name: /Obsidian Export/i }));

  // Remove button is now visible
  await waitFor(() => screen.getByRole("button", { name: /^Remove$/i }));
  await userEvent.click(screen.getByRole("button", { name: /^Remove$/i }));

  await waitFor(() => {
    expect(mockSaveObsidianSettings).toHaveBeenCalledWith(
      expect.objectContaining({ github_token: "" }),
    );
  });
  expect(screen.getByText(/GitHub token removed/i)).toBeInTheDocument();
});

// ── handleRemoveObsidianToken — error ─────────────────────────────────────────

test("Remove token shows error message when saveObsidianSettings rejects", async () => {
  mockGetObsidianSettings.mockResolvedValue({
    obsidian_repo: "user/vault",
    obsidian_path: "Notes/Books",
    has_github_token: true,
  });
  mockSaveObsidianSettings.mockRejectedValueOnce(new Error("Network failure"));

  render(<ProfilePage />);

  await waitFor(() => screen.getByRole("button", { name: /Obsidian Export/i }));
  fireEvent.click(screen.getByRole("button", { name: /Obsidian Export/i }));

  await waitFor(() => screen.getByRole("button", { name: /^Remove$/i }));
  await userEvent.click(screen.getByRole("button", { name: /^Remove$/i }));

  await waitFor(() =>
    expect(screen.getByText(/Network failure/i)).toBeInTheDocument()
  );
});

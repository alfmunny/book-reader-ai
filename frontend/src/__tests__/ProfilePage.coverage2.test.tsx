/**
 * ProfilePage — coverage2: inline arrow functions not yet hit
 *   Line 136: () => router.push("/") — Library back button
 *   Line 164: () => signOut(...)     — Sign out button
 *   Line 171: () => router.push("/admin") — Admin Panel button
 *   Line 272: (e) => setObsidianRepo — obsidianRepo onChange
 *   Line 285: (e) => setObsidianPath — obsidianPath onChange
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ProfilePage from "@/app/profile/page";

const mockPush = jest.fn();
const mockSignOut = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: jest.fn().mockReturnValue({
    data: {
      backendToken: "tok",
      backendUser: { name: "Test", email: "t@t.com", picture: "" },
    },
  }),
  signOut: (...args: any[]) => mockSignOut(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/lib/api", () => ({
  saveGeminiKey: jest.fn().mockResolvedValue({}),
  deleteGeminiKey: jest.fn().mockResolvedValue({}),
  getMe: jest.fn().mockResolvedValue({ hasGeminiKey: false, role: "user" }),
  getObsidianSettings: jest.fn().mockResolvedValue({ obsidian_repo: "u/v", obsidian_path: "Notes" }),
  saveObsidianSettings: jest.fn().mockResolvedValue({}),
  getUserStats: jest.fn().mockResolvedValue({ totals: { books_started: 0, vocabulary_words: 0, annotations: 0, insights: 0 }, streak: 0, longest_streak: 0, activity: [] }),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn().mockReturnValue({
    insightLang: "en", translationLang: "de", translationEnabled: false,
    ttsGender: "female", chatFontSize: "xs", translationProvider: "auto",
    fontSize: "base", theme: "light",
  }),
  saveSettings: jest.fn(),
}));

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Line 136: "← Library" back button ────────────────────────────────────────

test("clicking ← Library navigates to /", async () => {
  render(<ProfilePage />);
  await act(async () => await flushPromises());

  fireEvent.click(screen.getByRole("button", { name: /Library/i }));
  expect(mockPush).toHaveBeenCalledWith("/");
});

// ── Line 164: "Sign out" button ───────────────────────────────────────────────

test("clicking Sign out calls signOut with /login callback", async () => {
  render(<ProfilePage />);
  await act(async () => await flushPromises());

  fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
  expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
});

// ── Line 171: "Admin Panel" button ────────────────────────────────────────────

test("clicking Admin Panel navigates to /admin", async () => {
  const { getMe } = require("@/lib/api");
  getMe.mockResolvedValueOnce({ hasGeminiKey: false, role: "admin" });

  render(<ProfilePage />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /admin panel/i })).toBeInTheDocument()
  );

  fireEvent.click(screen.getByRole("button", { name: /admin panel/i }));
  expect(mockPush).toHaveBeenCalledWith("/admin");
});

// ── Line 272: obsidianRepo onChange ──────────────────────────────────────────

test("changing obsidianRepo input updates its value", async () => {
  render(<ProfilePage />);
  await act(async () => await flushPromises());

  fireEvent.click(screen.getByRole("button", { name: /Obsidian Export/i }));

  await waitFor(() => {
    expect((screen.getByPlaceholderText(/username\/obsidian-notes/i) as HTMLInputElement).value).toBe("u/v");
  });

  const repoInput = screen.getByPlaceholderText(/username\/obsidian-notes/i) as HTMLInputElement;
  fireEvent.change(repoInput, { target: { value: "myuser/my-vault" } });

  expect(repoInput.value).toBe("myuser/my-vault");
});

// ── Line 285: obsidianPath onChange ──────────────────────────────────────────

test("changing obsidianPath input updates its value", async () => {
  render(<ProfilePage />);
  await act(async () => await flushPromises());

  fireEvent.click(screen.getByRole("button", { name: /Obsidian Export/i }));

  await waitFor(() => {
    expect((screen.getByPlaceholderText(/All Notes\/002/i) as HTMLInputElement).value).toBe("Notes");
  });

  const pathInput = screen.getByPlaceholderText(/All Notes\/002/i) as HTMLInputElement;
  fireEvent.change(pathInput, { target: { value: "My Notes/Books" } });

  expect(pathInput.value).toBe("My Notes/Books");
});

// ── Lines 63-64: ?? null branches when obsidianSettings returns null fields ───

test("obsidianRepo defaults to empty string when API returns null", async () => {
  const { getObsidianSettings } = require("@/lib/api");
  getObsidianSettings.mockResolvedValueOnce({ obsidian_repo: null, obsidian_path: null });

  render(<ProfilePage />);
  await act(async () => await flushPromises());

  fireEvent.click(screen.getByRole("button", { name: /Obsidian Export/i }));

  // Both inputs should default to empty / fallback strings
  const repoInput = await waitFor(() => screen.getByPlaceholderText(/username\/obsidian-notes/i)) as HTMLInputElement;
  expect(repoInput.value).toBe("");

  const pathInput = screen.getByPlaceholderText(/All Notes\/002/i) as HTMLInputElement;
  expect(pathInput.value).toBe("All Notes/002 Literature Notes/000 Books");
});

// ── Line 56: getMe catch callback ────────────────────────────────────────────

test("silently catches getMe rejection without crashing", async () => {
  const { getMe } = require("@/lib/api");
  getMe.mockRejectedValueOnce(new Error("Unauthorized"));

  // Should not throw
  render(<ProfilePage />);
  await act(async () => await flushPromises());

  expect(screen.getByText(/Profile/i)).toBeInTheDocument();
});

// ── Line 65: getObsidianSettings catch callback ───────────────────────────────

test("silently catches getObsidianSettings rejection without crashing", async () => {
  const { getObsidianSettings } = require("@/lib/api");
  getObsidianSettings.mockRejectedValueOnce(new Error("Settings unavailable"));

  render(<ProfilePage />);
  await act(async () => await flushPromises());

  expect(screen.getByText(/Profile/i)).toBeInTheDocument();
});

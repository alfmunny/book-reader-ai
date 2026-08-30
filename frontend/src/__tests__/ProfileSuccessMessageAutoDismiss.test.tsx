/**
 * Regression test for #2368: profile page success messages (Gemini key save,
 * Obsidian settings save) must auto-dismiss after 3 s. Error messages must stay.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ProfilePage from "@/app/(shell)/profile/page";

jest.mock("next-auth/react", () => ({
  useSession: jest.fn().mockReturnValue({
    data: { backendToken: "tok", backendUser: { name: "Test" } },
  }),
  signOut: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn().mockReturnValue({ push: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  saveGeminiKey: jest.fn().mockResolvedValue({}),
  deleteGeminiKey: jest.fn().mockResolvedValue({}),
  getMe: jest.fn().mockResolvedValue({ hasGeminiKey: false, role: "user" }),
  getObsidianSettings: jest.fn().mockResolvedValue({
    obsidian_repo: "user/vault",
    obsidian_path: "Notes/Books",
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
    translationLang: "en",
    translationEnabled: false,
    ttsGender: "female",
    chatFontSize: "xs",
    translationProvider: "auto",
    fontSize: "base",
    theme: "light",
  }),
  saveSettings: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe("ProfilePage success message auto-dismiss (closes #2368)", () => {
  it("Gemini key success message disappears after 3 s", async () => {
    render(<ProfilePage />);

    const input = screen.getByPlaceholderText(/AIza/i);
    fireEvent.change(input, { target: { value: "my-gemini-key" } });
    fireEvent.click(screen.getAllByRole("button", { name: /save key/i })[0]);

    await waitFor(() =>
      expect(screen.getByText(/Gemini API key saved/i)).toBeInTheDocument()
    );

    act(() => { jest.advanceTimersByTime(3000); });

    expect(screen.queryByText(/Gemini API key saved/i)).not.toBeInTheDocument();
  });

  it("Gemini key error message stays visible after 3 s", async () => {
    const { saveGeminiKey } = require("@/lib/api");
    saveGeminiKey.mockRejectedValueOnce(new Error("Bad key"));

    render(<ProfilePage />);

    const input = screen.getByPlaceholderText(/AIza/i);
    fireEvent.change(input, { target: { value: "bad-key" } });
    fireEvent.click(screen.getAllByRole("button", { name: /save key/i })[0]);

    await waitFor(() =>
      expect(screen.getByText(/Bad key/i)).toBeInTheDocument()
    );

    act(() => { jest.advanceTimersByTime(3000); });

    expect(screen.getByText(/Bad key/i)).toBeInTheDocument();
  });

  it("Obsidian settings success message disappears after 3 s", async () => {
    render(<ProfilePage />);

    // Open the Obsidian accordion
    const obsidianBtn = screen.getByRole("button", { name: /obsidian export/i });
    fireEvent.click(obsidianBtn);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save obsidian settings/i })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: /save obsidian settings/i }));

    await waitFor(() =>
      expect(screen.getByText(/Obsidian settings saved/i)).toBeInTheDocument()
    );

    act(() => { jest.advanceTimersByTime(3000); });

    expect(screen.queryByText(/Obsidian settings saved/i)).not.toBeInTheDocument();
  });

  it("Obsidian settings error message stays visible after 3 s", async () => {
    const { saveObsidianSettings } = require("@/lib/api");
    saveObsidianSettings.mockRejectedValueOnce(new Error("Save failed"));

    render(<ProfilePage />);

    const obsidianBtn = screen.getByRole("button", { name: /obsidian export/i });
    fireEvent.click(obsidianBtn);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save obsidian settings/i })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: /save obsidian settings/i }));

    await waitFor(() =>
      expect(screen.getByText(/Save failed/i)).toBeInTheDocument()
    );

    act(() => { jest.advanceTimersByTime(3000); });

    expect(screen.getByText(/Save failed/i)).toBeInTheDocument();
  });
});

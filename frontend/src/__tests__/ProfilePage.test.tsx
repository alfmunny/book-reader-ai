/**
 * ProfilePage — Gemini key save/delete, Obsidian settings, preferences,
 * success/error messages, and admin visibility.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ProfilePage from "@/app/profile/page";

jest.mock("next-auth/react", () => ({
  useSession: jest.fn().mockReturnValue({
    data: { backendToken: "test-token", backendUser: { name: "Test" } },
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
  getUserStats: jest.fn().mockResolvedValue({ totals: { books_started: 0, vocabulary_words: 0, annotations: 0, insights: 0 }, streak: 0, longest_streak: 0, activity: [] }),
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ProfilePage — Gemini key management", () => {
  it("does not call saveGeminiKey when input is empty", async () => {
    const { saveGeminiKey } = require("@/lib/api");
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: /save key/i }));
    await act(async () => {});
    expect(saveGeminiKey).not.toHaveBeenCalled();
  });

  it("calls saveGeminiKey with trimmed key and shows success message", async () => {
    const { saveGeminiKey } = require("@/lib/api");
    render(<ProfilePage />);

    const input = screen.getByPlaceholderText(/AIza/i);
    fireEvent.change(input, { target: { value: "  my-key  " } });
    fireEvent.click(screen.getByRole("button", { name: /save key/i }));

    await waitFor(() => {
      expect(saveGeminiKey).toHaveBeenCalledWith("my-key");
      expect(screen.getByText(/Gemini API key saved/i)).toBeInTheDocument();
    });
  });

  it("shows error message when saveGeminiKey fails", async () => {
    const { saveGeminiKey } = require("@/lib/api");
    saveGeminiKey.mockRejectedValueOnce(new Error("Invalid key format"));

    render(<ProfilePage />);
    const input = screen.getByPlaceholderText(/AIza/i);
    fireEvent.change(input, { target: { value: "bad-key" } });
    fireEvent.click(screen.getByRole("button", { name: /save key/i }));

    await waitFor(() =>
      expect(screen.getByText(/Invalid key format/i)).toBeInTheDocument()
    );
  });

  it("calls deleteGeminiKey and shows success message when key exists", async () => {
    const { getMe, deleteGeminiKey } = require("@/lib/api");
    getMe.mockResolvedValueOnce({ hasGeminiKey: true, role: "user" });

    render(<ProfilePage />);
    await waitFor(() => screen.getByRole("button", { name: /remove key/i }));

    fireEvent.click(screen.getByRole("button", { name: /remove key/i }));

    await waitFor(() => {
      expect(deleteGeminiKey).toHaveBeenCalled();
      expect(screen.getByText(/Gemini key removed/i)).toBeInTheDocument();
    });
  });

  it("shows error message when deleteGeminiKey fails", async () => {
    const { getMe, deleteGeminiKey } = require("@/lib/api");
    getMe.mockResolvedValueOnce({ hasGeminiKey: true, role: "user" });
    deleteGeminiKey.mockRejectedValueOnce(new Error("Server error"));

    render(<ProfilePage />);
    await waitFor(() => screen.getByRole("button", { name: /remove key/i }));

    fireEvent.click(screen.getByRole("button", { name: /remove key/i }));
    await waitFor(() =>
      expect(screen.getByText(/Server error/i)).toBeInTheDocument()
    );
  });
});

describe("ProfilePage — Obsidian settings", () => {
  async function openObsidian() {
    fireEvent.click(screen.getByRole("button", { name: /Obsidian Export/i }));
  }

  it("loads existing Obsidian repo from API on mount", async () => {
    render(<ProfilePage />);
    await act(async () => {});
    openObsidian();
    await waitFor(() => {
      const repoInput = screen.getByPlaceholderText(/username\/obsidian-notes/i);
      expect((repoInput as HTMLInputElement).value).toBe("user/vault");
    });
  });

  it("calls saveObsidianSettings and clears token input on success", async () => {
    const { saveObsidianSettings } = require("@/lib/api");
    render(<ProfilePage />);
    await act(async () => {});
    openObsidian();
    await waitFor(() => screen.getByPlaceholderText(/username\/obsidian-notes/i));

    const tokenInput = screen.getByPlaceholderText(/ghp_/i);
    fireEvent.change(tokenInput, { target: { value: "ghp_abc123" } });

    fireEvent.click(screen.getByRole("button", { name: /save obsidian settings/i }));

    await waitFor(() => {
      expect(saveObsidianSettings).toHaveBeenCalledWith(
        expect.objectContaining({ github_token: "ghp_abc123" })
      );
      expect(screen.getByText(/Obsidian settings saved/i)).toBeInTheDocument();
    });
    expect((tokenInput as HTMLInputElement).value).toBe("");
  });

  it("does not include github_token when token input is empty", async () => {
    const { saveObsidianSettings } = require("@/lib/api");
    render(<ProfilePage />);
    await act(async () => {});
    openObsidian();
    await waitFor(() => screen.getByPlaceholderText(/username\/obsidian-notes/i));

    fireEvent.click(screen.getByRole("button", { name: /save obsidian settings/i }));

    await waitFor(() => expect(saveObsidianSettings).toHaveBeenCalled());
    const call = saveObsidianSettings.mock.calls[0][0];
    expect(call).not.toHaveProperty("github_token");
  });

  it("shows error when saveObsidianSettings fails", async () => {
    const { saveObsidianSettings } = require("@/lib/api");
    saveObsidianSettings.mockRejectedValueOnce(new Error("Auth failed"));

    render(<ProfilePage />);
    await act(async () => {});
    openObsidian();
    await waitFor(() => screen.getByRole("button", { name: /save obsidian settings/i }));
    fireEvent.click(screen.getByRole("button", { name: /save obsidian settings/i }));

    await waitFor(() =>
      expect(screen.getByText(/Auth failed/i)).toBeInTheDocument()
    );
  });
});

describe("ProfilePage — preferences", () => {
  it("loads settings from localStorage on mount and shows translation language", async () => {
    render(<ProfilePage />);
    await act(async () => {});
    // Two selects on page: insight lang and translation lang
    const selects = screen.getAllByRole("combobox");
    const translationSelect = selects.find(
      (s) => (s as HTMLSelectElement).value === "de"
    );
    expect(translationSelect).toBeDefined();
  });

  it("calls saveSettings when Save preferences button is clicked", async () => {
    const { saveSettings } = require("@/lib/settings");
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));
    expect(saveSettings).toHaveBeenCalled();
  });

  it("shows 'Saved!' confirmation after saving preferences", async () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));
    expect(screen.getByRole("button", { name: /saved!/i })).toBeInTheDocument();
  });
});

describe("ProfilePage — admin visibility", () => {
  it("does not show Admin Panel button for regular users", async () => {
    render(<ProfilePage />);
    await waitFor(() => screen.getByText(/Profile/i));
    expect(screen.queryByRole("button", { name: /admin panel/i })).not.toBeInTheDocument();
  });

  it("shows Admin Panel button when user is admin", async () => {
    const { getMe } = require("@/lib/api");
    getMe.mockResolvedValueOnce({ hasGeminiKey: false, role: "admin" });

    render(<ProfilePage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /admin panel/i })).toBeInTheDocument()
    );
  });
});

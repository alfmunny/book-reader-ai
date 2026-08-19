/**
 * ProfilePage — Claude and DeepSeek BYOK sections (in addition to Gemini).
 * Verifies both sections render, reflect getMe() key flags, and route saves
 * to the right API function.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  saveClaudeKey: jest.fn().mockResolvedValue({}),
  deleteClaudeKey: jest.fn().mockResolvedValue({}),
  saveDeepseekKey: jest.fn().mockResolvedValue({}),
  deleteDeepseekKey: jest.fn().mockResolvedValue({}),
  getMe: jest.fn().mockResolvedValue({
    hasGeminiKey: false,
    hasClaudeKey: false,
    hasDeepseekKey: true,
    role: "user",
  }),
  getObsidianSettings: jest.fn().mockResolvedValue({ obsidian_repo: "", obsidian_path: "" }),
  saveObsidianSettings: jest.fn().mockResolvedValue({}),
  listDecks: jest.fn().mockResolvedValue([]),
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

test("renders Claude and DeepSeek key sections alongside Gemini", async () => {
  render(<ProfilePage />);
  expect(screen.getByRole("region", { name: "Claude API Key" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "DeepSeek API Key" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Gemini API Key" })).toBeInTheDocument();
});

test("getMe flags flow into the sections: DeepSeek active, Claude shows input", async () => {
  render(<ProfilePage />);
  await waitFor(() =>
    expect(screen.getByText(/DeepSeek key is active/i)).toBeInTheDocument(),
  );
  expect(screen.getByPlaceholderText("sk-ant-…")).toBeInTheDocument();
  expect(screen.queryByPlaceholderText("sk-…")).toBeNull();
});

test("saving a Claude key calls saveClaudeKey, not the Gemini endpoint", async () => {
  const { saveClaudeKey, saveGeminiKey } = jest.requireMock("@/lib/api");
  render(<ProfilePage />);

  fireEvent.change(screen.getByPlaceholderText("sk-ant-…"), { target: { value: "sk-ant-xyz" } });
  const claudeSection = screen.getByRole("region", { name: "Claude API Key" });
  fireEvent.click(claudeSection.querySelector("button:not([disabled])")!);

  await waitFor(() => expect(saveClaudeKey).toHaveBeenCalledWith("sk-ant-xyz"));
  expect(saveGeminiKey).not.toHaveBeenCalled();
});

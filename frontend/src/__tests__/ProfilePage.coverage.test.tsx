/**
 * ProfilePage — additional coverage targeting uncovered lines:
 *   73-74:   updatePref helper (marks prefsSaved = false)
 *   136-171: specific save paths for Gemini key, Obsidian, prefs
 *   272-322: Preferences section UI — selects and radio buttons
 *   341:     translation language select change
 *   375:     ttsGender radio button change
 *   408:     translationProvider radio button change
 */
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import ProfilePage from "@/app/profile/page";

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock("next-auth/react", () => ({
  useSession: jest.fn().mockReturnValue({
    data: {
      backendToken: "tok",
      backendUser: { name: "Alice", email: "alice@example.com", picture: "" },
    },
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
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 73-74: updatePref sets prefsSaved to false when a preference changes
// ─────────────────────────────────────────────────────────────────────────────
describe("ProfilePage — updatePref resets saved state", () => {
  it("'Saved!' button reverts to 'Save preferences' after preference change", async () => {
    const { saveSettings } = require("@/lib/settings");
    render(<ProfilePage />);

    // Save once so button shows "Saved!"
    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));
    expect(screen.getByRole("button", { name: /saved!/i })).toBeInTheDocument();

    // Change any preference — this calls updatePref which sets prefsSaved=false
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "fr" } });

    // Button should revert to "Save preferences"
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /save preferences/i }),
      ).toBeInTheDocument(),
    );

    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("prefsSaved timer resets after 2 seconds", async () => {
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));
    expect(screen.getByRole("button", { name: /saved!/i })).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(2100));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /save preferences/i }),
      ).toBeInTheDocument(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 136-171: Gemini key section — full save/remove flow coverage
// ─────────────────────────────────────────────────────────────────────────────
describe("ProfilePage — Gemini key section states", () => {
  it("shows 'Saving…' state while save is in flight", async () => {
    const { saveGeminiKey } = require("@/lib/api");
    // Never resolves so we can observe the saving state
    saveGeminiKey.mockReturnValue(new Promise(() => {}));

    render(<ProfilePage />);
    const input = screen.getByPlaceholderText(/AIza/i);
    fireEvent.change(input, { target: { value: "AIzaTestKey" } });
    fireEvent.click(screen.getByRole("button", { name: /save key/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /saving…/i })).toBeInTheDocument(),
    );
  });

  it("shows 'Removing…' state while remove is in flight", async () => {
    const { getMe, deleteGeminiKey } = require("@/lib/api");
    getMe.mockResolvedValueOnce({ hasGeminiKey: true, role: "user" });
    deleteGeminiKey.mockReturnValue(new Promise(() => {}));

    render(<ProfilePage />);
    await waitFor(() =>
      screen.getByRole("button", { name: /remove key/i }),
    );

    fireEvent.click(screen.getByRole("button", { name: /remove key/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /removing…/i }),
      ).toBeInTheDocument(),
    );
  });

  it("shows deleteGeminiKey error when deletion fails with non-Error", async () => {
    const { getMe, deleteGeminiKey } = require("@/lib/api");
    getMe.mockResolvedValueOnce({ hasGeminiKey: true, role: "user" });
    deleteGeminiKey.mockRejectedValueOnce("plain string error");

    render(<ProfilePage />);
    await waitFor(() => screen.getByRole("button", { name: /remove key/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove key/i }));

    await waitFor(() =>
      expect(screen.getByText(/Failed to remove key/i)).toBeInTheDocument(),
    );
  });

  it("shows saveGeminiKey error with fallback text for non-Error throws", async () => {
    const { saveGeminiKey } = require("@/lib/api");
    saveGeminiKey.mockRejectedValueOnce("unexpected");

    render(<ProfilePage />);
    const input = screen.getByPlaceholderText(/AIza/i);
    fireEvent.change(input, { target: { value: "AIzaTest" } });
    fireEvent.click(screen.getByRole("button", { name: /save key/i }));

    await waitFor(() =>
      expect(screen.getByText(/Failed to save key/i)).toBeInTheDocument(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lines 272-322: Preferences section — all controls render and respond
// ─────────────────────────────────────────────────────────────────────────────
describe("ProfilePage — Preferences section rendering", () => {
  it("renders insight language select with current value", async () => {
    render(<ProfilePage />);
    await act(async () => {});
    const selects = screen.getAllByRole("combobox");
    // First select = insightLang, second = translationLang
    expect(selects[0]).toBeInTheDocument();
    expect((selects[0] as HTMLSelectElement).value).toBe("en");
  });

  it("renders TTS gender radio buttons", async () => {
    render(<ProfilePage />);
    await act(async () => {});
    const femaleRadio = screen.getByRole("radio", { name: /♀ female/i });
    const maleRadio = screen.getByRole("radio", { name: /♂ male/i });
    expect(femaleRadio).toBeInTheDocument();
    expect(maleRadio).toBeInTheDocument();
    expect((femaleRadio as HTMLInputElement).checked).toBe(true);
  });

  it("renders translation provider radio buttons", async () => {
    render(<ProfilePage />);
    await act(async () => {});
    // Use value-attribute selectors to avoid label-text collisions between options
    const autoRadio = document.querySelector('input[name="translationProvider"][value="auto"]') as HTMLInputElement;
    const googleRadio = document.querySelector('input[name="translationProvider"][value="google"]') as HTMLInputElement;
    const geminiRadio = document.querySelector('input[name="translationProvider"][value="gemini"]') as HTMLInputElement;
    expect(autoRadio).toBeInTheDocument();
    expect(googleRadio).toBeInTheDocument();
    expect(geminiRadio).toBeInTheDocument();
    expect(autoRadio.checked).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 341: translation language select onChange
// ─────────────────────────────────────────────────────────────────────────────
describe("ProfilePage — translation language change (line 341)", () => {
  it("updates translation language select on change", async () => {
    render(<ProfilePage />);
    await act(async () => {});

    const selects = screen.getAllByRole("combobox");
    const translationSelect = selects[1] as HTMLSelectElement;
    expect(translationSelect.value).toBe("de");

    fireEvent.change(translationSelect, { target: { value: "fr" } });
    expect(translationSelect.value).toBe("fr");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 375: ttsGender radio button onChange
// ─────────────────────────────────────────────────────────────────────────────
describe("ProfilePage — TTS gender radio change (line 375)", () => {
  it("switches TTS gender to male when male radio is clicked", async () => {
    render(<ProfilePage />);
    await act(async () => {});

    const maleRadio = screen.getByRole("radio", { name: /♂ male/i }) as HTMLInputElement;
    expect(maleRadio.checked).toBe(false);

    fireEvent.click(maleRadio);
    expect(maleRadio.checked).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line 408: translationProvider radio onChange
// ─────────────────────────────────────────────────────────────────────────────
describe("ProfilePage — translation provider radio change (line 408)", () => {
  it("switches translation provider to 'google' when that radio is clicked", async () => {
    render(<ProfilePage />);
    await act(async () => {});

    const googleRadio = document.querySelector(
      'input[name="translationProvider"][value="google"]',
    ) as HTMLInputElement;
    expect(googleRadio.checked).toBe(false);

    fireEvent.click(googleRadio);
    expect(googleRadio.checked).toBe(true);
  });

  it("switches translation provider to 'gemini'", async () => {
    render(<ProfilePage />);
    await act(async () => {});

    const geminiRadio = document.querySelector(
      'input[name="translationProvider"][value="gemini"]',
    ) as HTMLInputElement;
    fireEvent.click(geminiRadio);
    expect(geminiRadio.checked).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Obsidian — saving state coverage
// ─────────────────────────────────────────────────────────────────────────────
describe("ProfilePage — Obsidian saving state (line 136)", () => {
  it("shows 'Saving…' while Obsidian save is in flight", async () => {
    const { saveObsidianSettings } = require("@/lib/api");
    saveObsidianSettings.mockReturnValue(new Promise(() => {}));

    render(<ProfilePage />);
    await waitFor(() =>
      screen.getByRole("button", { name: /save obsidian settings/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /save obsidian settings/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /saving…/i }),
      ).toBeInTheDocument(),
    );
  });

  it("shows fallback error when saveObsidianSettings rejects with non-Error", async () => {
    const { saveObsidianSettings } = require("@/lib/api");
    saveObsidianSettings.mockRejectedValueOnce("oops");

    render(<ProfilePage />);
    await waitFor(() =>
      screen.getByRole("button", { name: /save obsidian settings/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /save obsidian settings/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/Failed to save/i)).toBeInTheDocument(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getMe returns no session (backendToken falsy) — no Obsidian settings loaded
// covers line 61 guard
// ─────────────────────────────────────────────────────────────────────────────
describe("ProfilePage — session without backendToken (lines 61, 73-74)", () => {
  it("does not call getObsidianSettings when there is no backendToken", async () => {
    const { useSession } = require("next-auth/react");
    const { getObsidianSettings } = require("@/lib/api");
    useSession.mockReturnValue({ data: null });

    render(<ProfilePage />);
    await act(async () => {});
    expect(getObsidianSettings).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// User picture shown when provided
// ─────────────────────────────────────────────────────────────────────────────
describe("ProfilePage — user with picture (line ~149)", () => {
  it("renders profile picture when user has a picture URL", async () => {
    const { useSession } = require("next-auth/react");
    useSession.mockReturnValue({
      data: {
        backendToken: "tok",
        backendUser: {
          name: "Bob",
          email: "bob@example.com",
          picture: "https://example.com/bob.jpg",
        },
      },
    });

    render(<ProfilePage />);
    await act(async () => {});
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toContain("bob.jpg");
    expect(img.alt).toBe("Bob");
  });
});

/**
 * Coverage tests for app/decks/new/page.tsx — branches not hit by DecksNewPage.test.tsx.
 * Closes #1967
 *
 * Covers:
 *  - splitTags helper (lines 8-11)
 *  - buildRulesJson: all rule combinations (lines 35-43)
 *  - Header back button navigates to /decks (line 78)
 *  - Switching back from smart → manual mode (line 139)
 *  - Smart-mode rule inputs populate and submit correctly (lines 190-289)
 *  - Generic API error fallback message (line 67)
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "token" } }),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/lib/api", () => ({
  createDeck: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  },
}));

import * as api from "@/lib/api";
import DecksNewPage from "@/app/decks/new/page";

const mockCreateDeck = api.createDeck as jest.MockedFunction<typeof api.createDeck>;

const CREATED_DECK = {
  id: 99,
  name: "Test deck",
  description: "",
  mode: "smart" as const,
  rules_json: null,
  created_at: "2026-04-28T08:00:00",
  updated_at: "2026-04-28T08:00:00",
  member_count: 0,
  members: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPush.mockReset();
});

// ── header back link ───────────────────────────────────────────────────────────

test("header back link navigates to /decks", async () => {
  render(<DecksNewPage />);
  // There are two links to /decks: header back and Cancel. Both are fine.
  const links = screen.getAllByRole("link", { name: /decks/i });
  expect(links.length).toBeGreaterThanOrEqual(1);
  expect(links[0]).toHaveAttribute("href", "/decks");
});

// ── smart → manual mode toggle ─────────────────────────────────────────────────

test("switching back from smart to manual hides the rules fieldset", async () => {
  render(<DecksNewPage />);
  const user = userEvent.setup();

  // Switch to smart first
  await user.click(screen.getByTestId("deck-mode-smart"));
  expect(screen.getByTestId("deck-rules-fieldset")).toBeInTheDocument();

  // Switch back to manual
  await user.click(screen.getByTestId("deck-mode-manual"));
  expect(screen.queryByTestId("deck-rules-fieldset")).not.toBeInTheDocument();
});

// ── buildRulesJson: null when no rules filled ──────────────────────────────────

test("smart deck with no rules filled submits rules_json: null", async () => {
  mockCreateDeck.mockResolvedValue(CREATED_DECK);
  render(<DecksNewPage />);
  const user = userEvent.setup();

  await user.type(screen.getByTestId("deck-name-input"), "Empty smart deck");
  await user.click(screen.getByTestId("deck-mode-smart"));
  await user.click(screen.getByTestId("deck-submit-btn"));

  await waitFor(() => {
    expect(mockCreateDeck).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "smart", rules_json: null }),
    );
  });
});

// ── buildRulesJson: language only ─────────────────────────────────────────────

test("smart deck with language rule passes language in rules_json", async () => {
  mockCreateDeck.mockResolvedValue(CREATED_DECK);
  render(<DecksNewPage />);
  const user = userEvent.setup();

  await user.type(screen.getByTestId("deck-name-input"), "German deck");
  await user.click(screen.getByTestId("deck-mode-smart"));
  await user.type(screen.getByLabelText(/language/i), "de");
  await user.click(screen.getByTestId("deck-submit-btn"));

  await waitFor(() => {
    expect(mockCreateDeck).toHaveBeenCalledWith(
      expect.objectContaining({ rules_json: { language: "de" } }),
    );
  });
});

// ── buildRulesJson: tags_any ───────────────────────────────────────────────────

test("smart deck with tags_any rule passes array in rules_json", async () => {
  mockCreateDeck.mockResolvedValue(CREATED_DECK);
  render(<DecksNewPage />);
  const user = userEvent.setup();

  await user.type(screen.getByTestId("deck-name-input"), "Tag deck");
  await user.click(screen.getByTestId("deck-mode-smart"));
  await user.type(screen.getByLabelText(/tags any of/i), "verbs, nouns");
  await user.click(screen.getByTestId("deck-submit-btn"));

  await waitFor(() => {
    expect(mockCreateDeck).toHaveBeenCalledWith(
      expect.objectContaining({ rules_json: { tags_any: ["verbs", "nouns"] } }),
    );
  });
});

// ── buildRulesJson: tags_all ───────────────────────────────────────────────────

test("smart deck with tags_all rule passes array in rules_json", async () => {
  mockCreateDeck.mockResolvedValue(CREATED_DECK);
  render(<DecksNewPage />);
  const user = userEvent.setup();

  await user.type(screen.getByTestId("deck-name-input"), "Tag all deck");
  await user.click(screen.getByTestId("deck-mode-smart"));
  await user.type(screen.getByLabelText(/tags all of/i), "advanced");
  await user.click(screen.getByTestId("deck-submit-btn"));

  await waitFor(() => {
    expect(mockCreateDeck).toHaveBeenCalledWith(
      expect.objectContaining({ rules_json: { tags_all: ["advanced"] } }),
    );
  });
});

// ── buildRulesJson: date range ─────────────────────────────────────────────────

test("smart deck with date range passes saved_after and saved_before", async () => {
  mockCreateDeck.mockResolvedValue(CREATED_DECK);
  render(<DecksNewPage />);
  const user = userEvent.setup();

  await user.type(screen.getByTestId("deck-name-input"), "Recent deck");
  await user.click(screen.getByTestId("deck-mode-smart"));

  const savedAfterInput = screen.getByLabelText(/saved after/i);
  const savedBeforeInput = screen.getByLabelText(/saved before/i);
  await user.type(savedAfterInput, "2026-01-01");
  await user.type(savedBeforeInput, "2026-04-28");
  await user.click(screen.getByTestId("deck-submit-btn"));

  await waitFor(() => {
    expect(mockCreateDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        rules_json: { saved_after: "2026-01-01", saved_before: "2026-04-28" },
      }),
    );
  });
});

// ── buildRulesJson: combined rules ────────────────────────────────────────────

test("smart deck with all rules filled combines them all in rules_json", async () => {
  mockCreateDeck.mockResolvedValue(CREATED_DECK);
  render(<DecksNewPage />);
  const user = userEvent.setup();

  await user.type(screen.getByTestId("deck-name-input"), "Full rules deck");
  await user.click(screen.getByTestId("deck-mode-smart"));
  await user.type(screen.getByLabelText(/language/i), "de");
  await user.type(screen.getByLabelText(/tags any of/i), "verbs");
  await user.type(screen.getByLabelText(/tags all of/i), "advanced");
  await user.click(screen.getByTestId("deck-submit-btn"));

  await waitFor(() => {
    expect(mockCreateDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "smart",
        rules_json: {
          language: "de",
          tags_any: ["verbs"],
          tags_all: ["advanced"],
        },
      }),
    );
  });
});

// ── generic API error fallback ────────────────────────────────────────────────

test("non-ApiError during submission shows generic fallback error message", async () => {
  mockCreateDeck.mockRejectedValue(new Error("network timeout"));
  render(<DecksNewPage />);
  const user = userEvent.setup();

  await user.type(screen.getByTestId("deck-name-input"), "Test deck");
  await user.click(screen.getByTestId("deck-submit-btn"));

  expect(await screen.findByTestId("deck-form-error")).toHaveTextContent(
    /could not create the deck/i,
  );
  expect(mockPush).not.toHaveBeenCalledWith("/decks");
});

// ── splitTags: handles extra whitespace and empty entries ─────────────────────

test("tags_any input trims whitespace and filters empty entries", async () => {
  mockCreateDeck.mockResolvedValue(CREATED_DECK);
  render(<DecksNewPage />);
  const user = userEvent.setup();

  await user.type(screen.getByTestId("deck-name-input"), "Whitespace deck");
  await user.click(screen.getByTestId("deck-mode-smart"));
  // Comma-separated with extra spaces and trailing comma
  await user.type(screen.getByLabelText(/tags any of/i), "  verbs ,  nouns , ");
  await user.click(screen.getByTestId("deck-submit-btn"));

  await waitFor(() => {
    expect(mockCreateDeck).toHaveBeenCalledWith(
      expect.objectContaining({ rules_json: { tags_any: ["verbs", "nouns"] } }),
    );
  });
});

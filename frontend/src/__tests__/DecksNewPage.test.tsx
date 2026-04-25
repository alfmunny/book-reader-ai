/**
 * Tests for /decks/new create-deck page (slice 3a of #741).
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
      this.status = status;
    }
  },
}));

import * as api from "@/lib/api";
import DecksNewPage from "@/app/decks/new/page";

const mockCreateDeck = api.createDeck as jest.MockedFunction<typeof api.createDeck>;

beforeEach(() => {
  jest.clearAllMocks();
});

test("renders form fields with 'manual' as default mode", () => {
  render(<DecksNewPage />);
  expect(screen.getByTestId("deck-name-input")).toBeInTheDocument();
  expect(screen.getByTestId("deck-description-input")).toBeInTheDocument();
  const manualRadio = screen.getByTestId("deck-mode-manual") as HTMLInputElement;
  expect(manualRadio.checked).toBe(true);
});

test("submitting a valid form creates a manual deck and navigates to /decks", async () => {
  mockCreateDeck.mockResolvedValue({
    id: 42,
    name: "German verbs",
    description: "",
    mode: "manual",
    rules_json: null,
    created_at: "2026-04-24T08:00:00",
    updated_at: "2026-04-24T08:00:00",
    member_count: 0,
    members: [],
  });

  render(<DecksNewPage />);
  const user = userEvent.setup();
  await user.type(screen.getByTestId("deck-name-input"), "German verbs");
  await user.type(screen.getByTestId("deck-description-input"), "Top-frequency verbs");
  await user.click(screen.getByTestId("deck-submit-btn"));

  await waitFor(() => {
    expect(mockCreateDeck).toHaveBeenCalledWith({
      name: "German verbs",
      description: "Top-frequency verbs",
      mode: "manual",
      rules_json: null,
    });
  });
  expect(mockPush).toHaveBeenCalledWith("/decks");
});

test("blocks submission when the name is blank", async () => {
  render(<DecksNewPage />);
  const user = userEvent.setup();
  await user.click(screen.getByTestId("deck-submit-btn"));
  expect(mockCreateDeck).not.toHaveBeenCalled();
  expect(await screen.findByTestId("deck-form-error")).toHaveTextContent(/name/i);
});

test("surfaces the API error instead of navigating on failure", async () => {
  mockCreateDeck.mockRejectedValue(
    new (api as typeof api & { ApiError: new (status: number, message: string) => Error }).ApiError(
      409,
      "A deck with this name already exists",
    ),
  );

  render(<DecksNewPage />);
  const user = userEvent.setup();
  await user.type(screen.getByTestId("deck-name-input"), "German verbs");
  await user.click(screen.getByTestId("deck-submit-btn"));

  expect(await screen.findByTestId("deck-form-error")).toHaveTextContent(/already exists/i);
  expect(mockPush).not.toHaveBeenCalledWith("/decks");
});

test("smart mode radio is enabled and reveals the rules sub-form when selected", async () => {
  render(<DecksNewPage />);
  const smartRadio = screen.getByTestId("deck-mode-smart") as HTMLInputElement;
  expect(smartRadio.disabled).toBe(false);

  // Rules sub-form is hidden in manual mode by default
  expect(screen.queryByTestId("deck-rules-fieldset")).toBeNull();

  const user = userEvent.setup();
  await user.click(smartRadio);
  expect(screen.getByTestId("deck-rules-fieldset")).toBeInTheDocument();
});

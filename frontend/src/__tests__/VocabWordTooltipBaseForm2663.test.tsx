/**
 * Regression tests for #2663.
 *
 * Looking up an inflected word used to show only which form it was ("past
 * participle of gehen") with no meaning attached, and saving it filed the
 * inflected surface form in the word list. The tooltip must now show the base
 * form's actual definitions and save under the base form.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGetWordDefinition = jest.fn();

jest.mock("@/lib/api", () => ({
  getWordDefinition: (...args: unknown[]) => mockGetWordDefinition(...args),
}));

import VocabWordTooltip from "@/components/VocabWordTooltip";

const RECT = {
  left: 100, top: 200, right: 200, bottom: 220,
  width: 100, height: 20, x: 100, y: 200,
  toJSON: () => ({}),
} as DOMRect;

function renderTooltip(overrides: Record<string, unknown> = {}) {
  const onSave = jest.fn();
  const props = { word: "gegangen", lang: "de", rect: RECT, onClose: jest.fn(), onSave, ...overrides };
  render(<VocabWordTooltip {...(props as never)} />);
  return { onSave };
}

const INFLECTED = {
  lemma: "gehen",
  language: "de",
  form_of: "past participle of gehen",
  definitions: [
    { pos: "verb", text: "to go, to walk" },
    { pos: "verb", text: "to leave, to depart" },
  ],
  url: "https://en.wiktionary.org/wiki/gehen",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetWordDefinition.mockResolvedValue(INFLECTED);
});

// ── showing the meaning ───────────────────────────────────────────────────────

it("shows the base form's meaning, not only which form the word is", async () => {
  renderTooltip();
  expect(await screen.findByText(/to go, to walk/i)).toBeInTheDocument();
});

it("still shows the form relationship as context", async () => {
  renderTooltip();
  expect(await screen.findByText(/past participle of gehen/i)).toBeInTheDocument();
});

it("names the base form so it is clear which word was looked up", async () => {
  renderTooltip();
  await waitFor(() => expect(screen.getByText(/to go, to walk/i)).toBeInTheDocument());
  expect(screen.getByText("gehen")).toBeInTheDocument();
});

it("omits the form-of line when the word is already a base form", async () => {
  mockGetWordDefinition.mockResolvedValue({
    lemma: "gehen", language: "de", form_of: null,
    definitions: [{ pos: "verb", text: "to go, to walk" }],
    url: "https://en.wiktionary.org/wiki/gehen",
  });
  renderTooltip({ word: "gehen" });
  await waitFor(() => expect(screen.getByText(/to go, to walk/i)).toBeInTheDocument());
  expect(screen.queryByText(/participle/i)).not.toBeInTheDocument();
});

it("tolerates a response with no form_of field at all", async () => {
  mockGetWordDefinition.mockResolvedValue({
    lemma: "gehen", language: "de",
    definitions: [{ pos: "verb", text: "to go, to walk" }],
    url: "",
  });
  renderTooltip({ word: "gegangen" });
  expect(await screen.findByText(/to go, to walk/i)).toBeInTheDocument();
});

// ── saving under the base form ────────────────────────────────────────────────

it("saves the base form rather than the inflected word", async () => {
  const user = userEvent.setup();
  const { onSave } = renderTooltip();
  await waitFor(() => expect(screen.getByText(/to go, to walk/i)).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: /save/i }));
  expect(onSave.mock.calls[0][0]).toBe("gehen");
});

it("labels the button with the word that will actually be saved", async () => {
  renderTooltip();
  expect(await screen.findByRole("button", { name: /save .*gehen.* to vocab/i })).toBeInTheDocument();
});

it("keeps the plain label when the word is already its base form", async () => {
  mockGetWordDefinition.mockResolvedValue({
    lemma: "gehen", language: "de", form_of: null,
    definitions: [{ pos: "verb", text: "to go" }], url: "",
  });
  renderTooltip({ word: "gehen" });
  await waitFor(() => expect(screen.getByText(/to go/i)).toBeInTheDocument());
  expect(screen.getByRole("button", { name: /^save to vocab$/i })).toBeInTheDocument();
});

it("falls back to the word as written when no base form was found", async () => {
  mockGetWordDefinition.mockResolvedValue({
    lemma: "flibbertigibbet", language: "en", form_of: null, definitions: [], url: "",
  });
  const user = userEvent.setup();
  const { onSave } = renderTooltip({ word: "flibbertigibbet", lang: "en" });
  await waitFor(() => expect(screen.getByText(/no definition found/i)).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: /save/i }));
  expect(onSave.mock.calls[0][0]).toBe("flibbertigibbet");
});

it("falls back to the word as written when the lookup fails outright", async () => {
  mockGetWordDefinition.mockRejectedValue(new Error("network down"));
  const user = userEvent.setup();
  const { onSave } = renderTooltip({ word: "gegangen" });
  await waitFor(() => expect(screen.getByText(/couldn't load definition/i)).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: /save/i }));
  expect(onSave.mock.calls[0][0]).toBe("gegangen");
});

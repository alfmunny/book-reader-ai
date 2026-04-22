/**
 * Unit tests for VocabWordTooltip component.
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGetWordDefinition = jest.fn();

jest.mock("@/lib/api", () => ({
  getWordDefinition: (...args: any[]) => mockGetWordDefinition(...args),
}));

import VocabWordTooltip from "@/components/VocabWordTooltip";

const RECT = {
  left: 100,
  top: 200,
  right: 200,
  bottom: 220,
  width: 100,
  height: 20,
  x: 100,
  y: 200,
  toJSON: () => ({}),
} as DOMRect;

const BASE = {
  word: "beistehen",
  lang: "de",
  rect: RECT,
  onClose: jest.fn(),
  onSave: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetWordDefinition.mockResolvedValue({
    lemma: "beistehen",
    language: "de",
    definitions: [{ pos: "Verb", text: "to assist" }],
    url: "https://en.wiktionary.org/wiki/beistehen",
  });
});

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

describe("VocabWordTooltip — rendering", () => {
  it("shows the word in the header", () => {
    render(<VocabWordTooltip {...BASE} />);
    expect(screen.getByText("beistehen")).toBeInTheDocument();
  });

  it("shows a loading spinner while fetching", () => {
    mockGetWordDefinition.mockReturnValue(new Promise(() => {})); // never resolves
    render(<VocabWordTooltip {...BASE} />);
    expect(screen.getByText(/Looking up/i)).toBeInTheDocument();
  });

  it("shows definition after load", async () => {
    render(<VocabWordTooltip {...BASE} />);
    await waitFor(() => expect(screen.getByText("to assist")).toBeInTheDocument());
    expect(screen.getByText("Verb")).toBeInTheDocument();
  });

  it("shows base form when lemma differs from word", async () => {
    mockGetWordDefinition.mockResolvedValue({
      lemma: "gehen",
      language: "de",
      definitions: [{ pos: "Verb", text: "past participle of gehen" }],
      url: "https://en.wiktionary.org/wiki/gegangen",
    });
    render(<VocabWordTooltip {...BASE} word="gegangen" />);
    await waitFor(() => expect(screen.getByText(/Base form/i)).toBeInTheDocument());
    expect(screen.getByText("gehen")).toBeInTheDocument();
  });

  it("shows 'No definition found' when API returns empty", async () => {
    mockGetWordDefinition.mockResolvedValue({
      lemma: "xyz",
      language: "de",
      definitions: [],
      url: "https://en.wiktionary.org/wiki/xyz",
    });
    render(<VocabWordTooltip {...BASE} word="xyz" />);
    await waitFor(() => expect(screen.getByText(/No definition found/i)).toBeInTheDocument());
  });

  it("shows 'No definition found' when API rejects", async () => {
    mockGetWordDefinition.mockRejectedValue(new Error("network error"));
    render(<VocabWordTooltip {...BASE} />);
    await waitFor(() => expect(screen.getByText(/No definition found/i)).toBeInTheDocument());
  });

  it("shows Wiktionary link after load", async () => {
    render(<VocabWordTooltip {...BASE} />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Wiktionary/i })).toBeInTheDocument()
    );
  });
});

describe("VocabWordTooltip — save behaviour", () => {
  it("calls onSave when 'Save to vocab' is clicked", async () => {
    render(<VocabWordTooltip {...BASE} />);
    await waitFor(() => expect(screen.getByText("to assist")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Save to vocab/i }));
    expect(BASE.onSave).toHaveBeenCalledTimes(1);
  });

  it("changes button to 'Saved ✓' after click", async () => {
    render(<VocabWordTooltip {...BASE} />);
    await waitFor(() => expect(screen.getByText("to assist")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Save to vocab/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Saved/i })).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: /Save to vocab/i })).not.toBeInTheDocument();
  });

  it("does not call onSave a second time when already saved", async () => {
    render(<VocabWordTooltip {...BASE} />);
    await waitFor(() => expect(screen.getByText("to assist")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Save to vocab/i }));
    await userEvent.click(screen.getByRole("button", { name: /Saved/i }));

    expect(BASE.onSave).toHaveBeenCalledTimes(1);
  });
});

describe("VocabWordTooltip — dismiss behaviour", () => {
  it("calls onClose when × button is clicked", async () => {
    render(<VocabWordTooltip {...BASE} />);
    await userEvent.click(screen.getByRole("button", { name: "×" }));
    expect(BASE.onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape key", async () => {
    render(<VocabWordTooltip {...BASE} />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(BASE.onClose).toHaveBeenCalledTimes(1);
  });
});

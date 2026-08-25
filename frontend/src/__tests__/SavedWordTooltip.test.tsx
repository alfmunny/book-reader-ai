/**
 * Regression (owner report, 2026-08-25): words already in the vocabulary get a
 * dotted underline in the reader, but the underline was inert — tapping/hovering
 * did nothing — and re-looking the word up via the "Word" toolbar button offered
 * "Save to vocab" as if it were new.
 *
 * Now: (1) tapping a dotted word opens the definition tooltip directly, and
 * (2) the tooltip recognizes saved words and shows an "In vocab" link to the
 * vocabulary page instead of a save button.
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

const mockGetWordDefinition = jest.fn();
jest.mock("@/lib/api", () => ({
  getWordDefinition: (...args: unknown[]) => mockGetWordDefinition(...args),
}));

import VocabWordTooltip from "@/components/VocabWordTooltip";
import SentenceReader from "@/components/SentenceReader";

const RECT = {
  left: 100, top: 200, right: 200, bottom: 220,
  width: 100, height: 20, x: 100, y: 200, toJSON: () => ({}),
} as DOMRect;

const noop = () => {};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetWordDefinition.mockResolvedValue({
    lemma: "Meer",
    language: "de",
    definitions: [{ pos: "Noun", text: "sea, ocean" }],
    url: "https://en.wiktionary.org/wiki/Meer",
  });
});

// ── SentenceReader: dotted words are tappable ────────────────────────────────

describe("SentenceReader saved-word tap", () => {
  const text = "Es schäumt das Meer in breiten Flüssen.";

  it("a vocab word renders as a button and clicking it reports word + sentence", () => {
    const onVocabWordClick = jest.fn();
    const { container } = render(
      <SentenceReader
        text={text}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        vocabWords={new Set(["meer"])}
        onVocabWordClick={onVocabWordClick}
      />,
    );
    const btn = screen.getByRole("button", { name: /Meer/ });
    fireEvent.click(btn);
    expect(onVocabWordClick).toHaveBeenCalledTimes(1);
    const [word, sentence, rect] = onVocabWordClick.mock.calls[0];
    expect(word).toBe("Meer");
    expect(sentence).toContain("schäumt das Meer");
    expect(rect).toBeDefined();
    expect(container.querySelector(".decoration-dotted")).not.toBeNull();
  });

  it("clicking a vocab word does not trigger the segment click (audio seek)", () => {
    const onSegmentClick = jest.fn();
    render(
      <SentenceReader
        text={text}
        duration={100}
        currentTime={0}
        isPlaying={true}
        onSegmentClick={onSegmentClick}
        vocabWords={new Set(["meer"])}
        onVocabWordClick={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Meer/ }));
    expect(onSegmentClick).not.toHaveBeenCalled();
  });

  it("without onVocabWordClick the underline stays decorative", () => {
    const { container } = render(
      <SentenceReader
        text={text}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        vocabWords={new Set(["meer"])}
      />,
    );
    expect(container.querySelector(".decoration-dotted")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Meer/ })).toBeNull();
  });
});

// ── VocabWordTooltip: saved words show their saved state ─────────────────────

describe("VocabWordTooltip saved state", () => {
  const BASE = {
    word: "Meer",
    lang: "de",
    rect: RECT,
    onClose: noop,
    onSave: jest.fn(),
  };

  it("shows an 'In vocab' link instead of a save button when the word is saved", async () => {
    render(<VocabWordTooltip {...BASE} savedWords={new Set(["meer"])} />);
    await act(async () => {});
    const link = screen.getByRole("link", { name: /in vocab/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("/vocabulary?word="));
    expect(screen.queryByRole("button", { name: /save to vocab/i })).toBeNull();
    // The definition still loads and shows
    expect(screen.getByText("sea, ocean")).toBeInTheDocument();
  });

  it("recognizes a saved base form when the tapped word is inflected", async () => {
    mockGetWordDefinition.mockResolvedValue({
      lemma: "Meer",
      language: "de",
      definitions: [{ pos: "Noun", text: "sea, ocean" }],
      form_of: "dative plural of Meer",
      url: "https://en.wiktionary.org/wiki/Meer",
    });
    render(<VocabWordTooltip {...BASE} word="Meeren" savedWords={new Set(["meer"])} />);
    await act(async () => {});
    expect(screen.getByRole("link", { name: /in vocab/i })).toBeInTheDocument();
  });

  it("still offers save when the word is not in the vocabulary", async () => {
    render(<VocabWordTooltip {...BASE} savedWords={new Set(["anderswort"])} />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: /save to vocab/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /in vocab/i })).toBeNull();
  });
});

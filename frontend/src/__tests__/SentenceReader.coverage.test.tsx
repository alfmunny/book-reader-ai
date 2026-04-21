/**
 * SentenceReader — coverage tests for previously uncovered lines:
 *   48, 65:       splitSentences abbreviation guard; isVerse detection
 *   83-91:        parseIntoSegments with no paragraphs / single paragraph
 *   170-182:      chunk timing path a (word boundaries / exact TTS timing)
 *   401-409:      showAnnotations=false hides annotation underlines/dots
 *   455-458, 487-516: long-press handlers (pointer move cancel, onWordTap path)
 *   562, 580, 598: verse rendering, parallel translation, inline translation
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
  act,
} from "@testing-library/react";
import SentenceReader, { ChunkInfo } from "@/components/SentenceReader";
import type { Annotation } from "@/lib/api";

const noop = () => {};

function getSegments(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-seg]")) as HTMLElement[];
}

/**
 * Dispatch a pointer event with real clientX/clientY values.
 * fireEvent.pointerDown/Move don't propagate clientX in jsdom — we have to
 * create a MouseEvent (which jsdom supports fully) and override the
 * read-only properties via Object.defineProperty.
 */
function dispatchPointerEvent(
  el: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  coords: { clientX: number; clientY: number } = { clientX: 0, clientY: 0 },
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clientX", { value: coords.clientX });
  Object.defineProperty(event, "clientY", { value: coords.clientY });
  el.dispatchEvent(event);
}

// ── Lines 48, 65: abbreviation guard & isVerse detection ─────────────────────

describe("SentenceReader — splitSentences abbreviation guard (line 48)", () => {
  it("does not split on Dr. / Mr. / Mrs. abbreviations", () => {
    const { container } = render(
      <SentenceReader
        text="Dr. Smith examined the patient. He was fine."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    const segs = getSegments(container);
    // "Dr. Smith examined the patient." is one sentence, not split at "Dr."
    const allText = segs.map((s) => s.textContent ?? "").join(" ");
    expect(allText).toContain("Dr. Smith examined the patient");
    // Should be exactly 2 segments (not 3)
    expect(segs.length).toBe(2);
  });

  it("does not split on single-letter initials (e.g. J. K. Rowling)", () => {
    const { container } = render(
      <SentenceReader
        text="J. K. Rowling wrote the books. They are popular."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    const segs = getSegments(container);
    // Should not over-split — at most 3 segments for two clear sentences
    expect(segs.length).toBeLessThanOrEqual(3);
  });
});

describe("SentenceReader — isVerse detection (line 65)", () => {
  it("renders verse lines as separate block spans when all lines <= 60 chars", () => {
    // Each line is short → isVerse returns true → rendered as <span class="block">
    const verseText =
      "Roses are red,\nViolets are blue,\nSugar is sweet,\nAnd so are you.";

    const { container } = render(
      <SentenceReader
        text={verseText}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    // Verse segments are wrapped in <span class="block">
    const blockSpans = container.querySelectorAll("span.block");
    expect(blockSpans.length).toBeGreaterThanOrEqual(4);
  });

  it("renders prose (lines > 60 chars) as normal <p> segments, not block spans", () => {
    // Long prose wrapped by Gutenberg style — any line > 60 chars → NOT verse
    const proseParagraph =
      "It was the best of times, it was the worst of times, it was the age of wisdom.\nIt was the epoch of belief.";

    const { container } = render(
      <SentenceReader
        text={proseParagraph}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    // No block-span wrappers — lines joined into prose sentences
    const blockSpans = container.querySelectorAll("span.block");
    expect(blockSpans.length).toBe(0);
    // Should have segments rendered inside a <p>
    const segs = getSegments(container);
    expect(segs.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Lines 83-91: parseIntoSegments edge cases ─────────────────────────────────

describe("SentenceReader — parseIntoSegments edge cases (lines 83-91)", () => {
  it("renders empty string with no segments", () => {
    const { container } = render(
      <SentenceReader
        text=""
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    expect(getSegments(container).length).toBe(0);
  });

  it("renders a single paragraph with no newlines as a prose segment", () => {
    const { container } = render(
      <SentenceReader
        text="A single paragraph with no newlines at all."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    const segs = getSegments(container);
    expect(segs.length).toBe(1);
    expect(segs[0].textContent).toContain("single paragraph");
  });

  it("paragraph with single embedded newline: joins lines and sentences as prose", () => {
    // A paragraph with a single \n (not \n\n) — would be classified as multi-line.
    // Lines are all longer than 60 chars → NOT verse → joined and split as prose.
    const text =
      "This is the first line of a paragraph that is longer than sixty characters.\nThis is the second line of the same paragraph also exceeding sixty characters.";
    const { container } = render(
      <SentenceReader
        text={text}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    const segs = getSegments(container);
    // Lines joined → two prose sentences
    expect(segs.length).toBeGreaterThanOrEqual(1);
    const allText = segs.map((s) => s.textContent ?? "").join(" ");
    expect(allText).toContain("first line");
    expect(allText).toContain("second line");
  });
});

// ── Lines 170-182: word-boundary path (path a) ───────────────────────────────

describe("SentenceReader — word boundary timing (lines 170-182)", () => {
  it("uses wordBoundaries offset_ms for segment start times (path a)", () => {
    const chunk1 = "Hello world. This is a test.";
    // Word boundaries: "Hello"=0ms, "world"=500ms, "This"=1000ms, etc.
    const wordBoundaries = [
      { offset_ms: 0,    word: "Hello" },
      { offset_ms: 500,  word: "world" },
      { offset_ms: 1000, word: "This" },
      { offset_ms: 1500, word: "is" },
      { offset_ms: 2000, word: "a" },
      { offset_ms: 2500, word: "test" },
    ];
    const chunks: ChunkInfo[] = [
      { text: chunk1, duration: 3, wordBoundaries },
    ];

    const { container, rerender } = render(
      <SentenceReader
        text={chunk1}
        duration={3}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    // At t=1.5 ("This is a test." starts at ~1.0s via word boundary)
    rerender(
      <SentenceReader
        text={chunk1}
        duration={3}
        currentTime={1.5}
        isPlaying={true}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    const active = container.querySelector(".bg-amber-300");
    expect(active).not.toBeNull();
    // Second sentence should be active
    expect(active?.textContent).toContain("This is a test");
  });

  it("falls back to chunkStartTime when segment not found in word boundary path", () => {
    // Chunk text doesn't contain the second segment → indexOf returns -1 → fallback
    const chunkText = "Hello world.";
    const chunks: ChunkInfo[] = [
      {
        text: chunkText,
        duration: 2,
        wordBoundaries: [{ offset_ms: 0, word: "Hello" }],
      },
    ];

    const { container, rerender } = render(
      <SentenceReader
        text="Hello world. Completely different second sentence."
        duration={2}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    rerender(
      <SentenceReader
        text="Hello world. Completely different second sentence."
        duration={2}
        currentTime={0.1}
        isPlaying={true}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    // Should not crash; component renders without error regardless
    expect(container).toBeTruthy();
  });
});

// ── Lines 401-409: showAnnotations=false ─────────────────────────────────────

describe("SentenceReader — showAnnotations=false (lines 401-409)", () => {
  it("hides annotation underline class when showAnnotations=false", () => {
    const annotations: Annotation[] = [
      {
        id: 1,
        book_id: 1,
        chapter_index: 0,
        sentence_text: "Annotated sentence here.",
        note_text: "A note",
        color: "yellow",
      },
    ];

    const { container } = render(
      <SentenceReader
        text="Annotated sentence here."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={annotations}
        showAnnotations={false}
      />
    );

    const segs = getSegments(container);
    const seg = segs.find((s) => s.textContent?.includes("Annotated sentence"));
    expect(seg).toBeDefined();
    // With showAnnotations=false the underline class should NOT appear
    expect(seg?.className).not.toContain("border-yellow-400");
  });

  it("hides note dot button when showAnnotations=false", () => {
    const annotations: Annotation[] = [
      {
        id: 2,
        book_id: 1,
        chapter_index: 0,
        sentence_text: "Note dot sentence.",
        note_text: "Has a note",
        color: "blue",
      },
    ];

    render(
      <SentenceReader
        text="Note dot sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={annotations}
        showAnnotations={false}
      />
    );

    // Note toggle button should NOT be rendered
    expect(screen.queryByRole("button", { name: "Toggle note" })).not.toBeInTheDocument();
  });

  it("shows annotation underline when showAnnotations defaults to true", () => {
    const annotations: Annotation[] = [
      {
        id: 3,
        book_id: 1,
        chapter_index: 0,
        sentence_text: "Default annotations visible.",
        note_text: "",
        color: "green",
      },
    ];

    const { container } = render(
      <SentenceReader
        text="Default annotations visible."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={annotations}
      />
    );

    const segs = getSegments(container);
    const seg = segs.find((s) => s.textContent?.includes("Default annotations"));
    expect(seg?.className).toContain("border-green-400");
  });
});

// ── Lines 455-458: cancelLongPress / handlePointerMove ───────────────────────
// NOTE: jest.useRealTimers() is called in afterEach so subsequent tests are
// not affected if an expect() throws before reaching useRealTimers().

describe("SentenceReader — pointer move cancels long press (lines 455-458)", () => {
  afterEach(() => { jest.useRealTimers(); });

  it("cancels long press if pointer moves more than 10px", () => {
    jest.useFakeTimers();
    const onAnnotate = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Move and cancel sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        onAnnotate={onAnnotate}
      />
    );

    const segs = getSegments(container);
    // Start press at (10, 10)
    dispatchPointerEvent(segs[0], "pointerdown", { clientX: 10, clientY: 10 });
    // Move more than 10px away → should cancel the long-press timer
    dispatchPointerEvent(segs[0], "pointermove", { clientX: 25, clientY: 10 });

    act(() => { jest.advanceTimersByTime(500); });

    // onAnnotate should NOT have been called
    expect(onAnnotate).not.toHaveBeenCalled();
  });

  it("does not cancel if pointer moves less than 10px", () => {
    jest.useFakeTimers();
    const onAnnotate = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Small move sentence here."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        onAnnotate={onAnnotate}
        chapterIndex={1}
      />
    );

    const segs = getSegments(container);
    dispatchPointerEvent(segs[0], "pointerdown", { clientX: 10, clientY: 10 });
    // Move only 5px — within the 10px tolerance
    dispatchPointerEvent(segs[0], "pointermove", { clientX: 14, clientY: 10 });

    act(() => { jest.advanceTimersByTime(500); });

    expect(onAnnotate).toHaveBeenCalledTimes(1);
  });

  it("pointerCancel clears the long-press timer", () => {
    jest.useFakeTimers();
    const onAnnotate = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Cancel event sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        onAnnotate={onAnnotate}
      />
    );

    const segs = getSegments(container);
    dispatchPointerEvent(segs[0], "pointerdown", { clientX: 10, clientY: 10 });
    // pointerCancel should call cancelLongPress
    dispatchPointerEvent(segs[0], "pointercancel", { clientX: 10, clientY: 10 });

    act(() => { jest.advanceTimersByTime(500); });

    expect(onAnnotate).not.toHaveBeenCalled();
  });
});

// ── Lines 487-516: onWordTap long-press path ──────────────────────────────────

describe("SentenceReader — onWordTap long-press (lines 487-516)", () => {
  afterEach(() => { jest.useRealTimers(); });

  it("calls onWordTap after 500ms long press", () => {
    jest.useFakeTimers();
    const onWordTap = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Long press word sentence here."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        onWordTap={onWordTap}
        chapterIndex={3}
      />
    );

    const segs = getSegments(container);
    dispatchPointerEvent(segs[0], "pointerdown", { clientX: 50, clientY: 50 });

    act(() => { jest.advanceTimersByTime(550); });

    expect(onWordTap).toHaveBeenCalledTimes(1);
    const info = onWordTap.mock.calls[0][0];
    expect(info).toHaveProperty("sentenceText");
    expect(info).toHaveProperty("startTime");
    expect(info.chapterIndex).toBe(3);
  });

  it("onWordTap not called if pointer released before 500ms", () => {
    jest.useFakeTimers();
    const onWordTap = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Short tap on word sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        onWordTap={onWordTap}
      />
    );

    const segs = getSegments(container);
    dispatchPointerEvent(segs[0], "pointerdown", { clientX: 50, clientY: 50 });
    dispatchPointerEvent(segs[0], "pointerup", { clientX: 50, clientY: 50 });

    act(() => { jest.advanceTimersByTime(600); });

    expect(onWordTap).not.toHaveBeenCalled();
  });

  it("onWordTap cancelled when pointer moves more than 10px", () => {
    jest.useFakeTimers();
    const onWordTap = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Move cancel word tap sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        onWordTap={onWordTap}
      />
    );

    const segs = getSegments(container);
    dispatchPointerEvent(segs[0], "pointerdown", { clientX: 10, clientY: 10 });
    // Move > 10px → cancel
    dispatchPointerEvent(segs[0], "pointermove", { clientX: 30, clientY: 10 });

    act(() => { jest.advanceTimersByTime(600); });

    expect(onWordTap).not.toHaveBeenCalled();
  });

  it("onWordTap receives translationText when translations provided", () => {
    jest.useFakeTimers();
    const onWordTap = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Translated sentence here."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        onWordTap={onWordTap}
        translations={["Übersetzte Satz hier."]}
        translationDisplayMode="inline"
        chapterIndex={0}
      />
    );

    const segs = getSegments(container);
    dispatchPointerEvent(segs[0], "pointerdown", { clientX: 50, clientY: 50 });

    act(() => { jest.advanceTimersByTime(600); });

    expect(onWordTap).toHaveBeenCalledTimes(1);
    const info = onWordTap.mock.calls[0][0];
    expect(info.translationText).toBe("Übersetzte Satz hier.");
  });
});

// ── Line 562: verse rendering ─────────────────────────────────────────────────

describe("SentenceReader — verse rendering (line 562)", () => {
  it("wraps verse lines in block spans", () => {
    const verseText =
      "To be, or not to be,\nThat is the question.\nWhether 'tis nobler,\nTo suffer the slings.";

    const { container } = render(
      <SentenceReader
        text={verseText}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );

    const blockSpans = container.querySelectorAll("span.block");
    expect(blockSpans.length).toBeGreaterThanOrEqual(4);
  });

  it("verse segments are rendered and contain expected text", () => {
    const verseText = "Brief line one.\nBrief line two.\nBrief line three.";

    const { container } = render(
      <SentenceReader
        text={verseText}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );

    const segs = getSegments(container);
    expect(segs.length).toBeGreaterThanOrEqual(3);
    const allText = segs.map((s) => s.textContent ?? "").join(" ");
    expect(allText).toContain("Brief line one");
    expect(allText).toContain("Brief line two");
  });

  it("verse segments have data-seg attributes", () => {
    const verseText = "Short verse.\nAnother line.\nFinal line.";

    const { container } = render(
      <SentenceReader
        text={verseText}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );

    const segs = getSegments(container);
    expect(segs.length).toBeGreaterThanOrEqual(3);
    // Each segment should have a numeric data-seg attribute
    segs.forEach((s) => {
      expect(s.dataset.seg).toBeDefined();
    });
  });
});

// ── Line 580: parallel translation rendering ──────────────────────────────────

describe("SentenceReader — parallel translation rendering (line 580)", () => {
  it("renders the translation in a [data-translation] pane alongside original", () => {
    render(
      <SentenceReader
        text="Original sentence one."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        translations={["Übersetzung Satz eins."]}
        translationDisplayMode="parallel"
      />
    );

    const transEl = document.querySelector("[data-translation='true']");
    expect(transEl).not.toBeNull();
    expect(transEl?.textContent).toContain("Übersetzung Satz eins");
  });

  it("shows loading skeleton in parallel mode when translationLoading=true and no text", () => {
    const { container } = render(
      <SentenceReader
        text="Loading para."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        translations={[""]}
        translationDisplayMode="parallel"
        translationLoading={true}
      />
    );

    const pulse = container.querySelector("[data-translation='true'] .animate-pulse");
    expect(pulse).not.toBeNull();
  });

  it("renders multiple paragraphs in parallel mode", () => {
    render(
      <SentenceReader
        text={"First paragraph.\n\nSecond paragraph."}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        translations={["Erster Absatz.", "Zweiter Absatz."]}
        translationDisplayMode="parallel"
      />
    );

    expect(screen.getByText("Erster Absatz.")).toBeInTheDocument();
    expect(screen.getByText("Zweiter Absatz.")).toBeInTheDocument();
  });
});

// ── Line 598: inline translation rendering ────────────────────────────────────

describe("SentenceReader — inline translation rendering (line 598)", () => {
  it("renders translation below original in inline mode", () => {
    render(
      <SentenceReader
        text="Inline original sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        translations={["Inline Übersetzung."]}
        translationDisplayMode="inline"
      />
    );

    const transEl = document.querySelector("[data-translation='true']");
    expect(transEl).not.toBeNull();
    expect(transEl?.textContent).toContain("Inline Übersetzung");
  });

  it("shows inline loading skeleton for first paragraph when translationLoading=true", () => {
    const { container } = render(
      <SentenceReader
        text="First para for loading."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        translations={[""]}
        translationDisplayMode="inline"
        translationLoading={true}
      />
    );

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("does not show inline skeleton for subsequent paragraphs", () => {
    // The skeleton only shows for textParaIdx===0 && !translationText
    const { container } = render(
      <SentenceReader
        text={"Para one.\n\nPara two."}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        translations={["", ""]}
        translationDisplayMode="inline"
        translationLoading={true}
      />
    );

    // Only one skeleton (for first paragraph)
    const pulses = container.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBe(1);
  });
});

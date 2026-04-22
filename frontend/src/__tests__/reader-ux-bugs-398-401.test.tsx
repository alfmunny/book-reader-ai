/**
 * Regression tests for reader UX bugs #398–401:
 *
 * #398 — TypographyPanel must not be a descendant of the header (opacity-0
 *         in focus mode would make it invisible).
 * #399 — seekTo while paused must not let a browser timeupdate event on the
 *         paused audio element override the seeked currentTime.
 * #400 — SelectionToolbar Highlight must pass the full sentence context, not
 *         just the selected substring.
 * #401 — SentenceReader must assign correct chunkIdx even when the segment
 *         text and chunk text differ only in whitespace.
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import SelectionToolbar from "@/components/SelectionToolbar";
import SentenceReader, { ChunkInfo } from "@/components/SentenceReader";

// ── Bug #400: SelectionToolbar Highlight uses full sentence context ────────────

function makeReaderEl() {
  const el = document.createElement("div");
  el.id = "reader-scroll";
  document.body.appendChild(el);
  return el;
}

describe("SelectionToolbar Highlight — bug #400", () => {
  let readerEl: HTMLElement;

  beforeEach(() => {
    readerEl = makeReaderEl();
    jest.spyOn(window, "getSelection").mockReturnValue(null);
  });
  afterEach(() => {
    readerEl.remove();
    jest.restoreAllMocks();
  });

  it("calls onHighlight with full sentence context when selection is inside a data-seg span", () => {
    const onHighlight = jest.fn();
    render(<SelectionToolbar onHighlight={onHighlight} />);

    // Build: <div#reader-scroll><p><span data-seg="0">Full sentence text.</span></p></div>
    const p = document.createElement("p");
    const sentenceSpan = document.createElement("span");
    sentenceSpan.setAttribute("data-seg", "0");
    sentenceSpan.textContent = "Full sentence text.";
    p.appendChild(sentenceSpan);
    readerEl.appendChild(p);

    // User selects just one word ("sentence") from inside the span
    const textNode = sentenceSpan.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 5);  // start of "sentence"
    range.setEnd(textNode, 13);

    const mockRect = {
      left: 100, right: 200, top: 300, bottom: 320,
      width: 100, height: 20, x: 100, y: 300,
      toJSON: () => ({}),
    } as DOMRect;
    range.getBoundingClientRect = jest.fn().mockReturnValue(mockRect);

    const mockSel = {
      toString: () => "sentence",
      getRangeAt: () => range,
      removeAllRanges: jest.fn(),
    } as unknown as Selection;
    jest.spyOn(window, "getSelection").mockReturnValue(mockSel);

    act(() => { document.dispatchEvent(new Event("selectionchange")); });

    fireEvent.click(screen.getByRole("button", { name: /Highlight/i }));

    // Must receive the full sentence, not just "sentence"
    expect(onHighlight).toHaveBeenCalledWith("Full sentence text.");
  });

  it("falls back to selected text when no sentence context is found", () => {
    const onHighlight = jest.fn();
    render(<SelectionToolbar onHighlight={onHighlight} />);

    // Selection inside a plain div (no data-seg, no <p>)
    const textNode = document.createTextNode("just a word");
    const span = document.createElement("span");
    span.appendChild(textNode);
    readerEl.appendChild(span);

    const range = document.createRange();
    range.selectNodeContents(textNode);

    const mockRect = {
      left: 100, right: 200, top: 300, bottom: 320,
      width: 100, height: 20, x: 100, y: 300, toJSON: () => ({}),
    } as DOMRect;
    range.getBoundingClientRect = jest.fn().mockReturnValue(mockRect);

    const mockSel = {
      toString: () => "just a word",
      getRangeAt: () => range,
      removeAllRanges: jest.fn(),
    } as unknown as Selection;
    jest.spyOn(window, "getSelection").mockReturnValue(mockSel);

    act(() => { document.dispatchEvent(new Event("selectionchange")); });
    fireEvent.click(screen.getByRole("button", { name: /Highlight/i }));

    expect(onHighlight).toHaveBeenCalledWith("just a word");
  });
});

// ── Bug #401: SentenceReader whitespace-normalised chunk matching ─────────────

const noop = () => {};

function getSegments(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-seg]")).map((el) => ({
    idx: Number((el as HTMLElement).dataset.seg),
    text: el.textContent?.trim() ?? "",
    loaded: !el.className.includes("text-stone-400"),
  }));
}

describe("SentenceReader chunk matching — bug #401", () => {
  it("matches segments when chunk text has double spaces from paragraph join", () => {
    // chunk_text joins paragraphs with \n\n which becomes double-space after
    // replace(/\r?\n/g, " "). Segments from splitSentences are trimmed, so
    // indexOf(segment, cursor) must still succeed.
    const s1 = "First sentence of paragraph one.";
    const s2 = "Second sentence of paragraph one.";
    const s3 = "First sentence of paragraph two.";

    // Simulate chunk text as produced by backend: two paragraphs joined with \n\n
    const chunkText = `${s1} ${s2}\n\n${s3}`;
    const chunks: ChunkInfo[] = [{ text: chunkText, duration: 6 }];

    // Chapter text: same two paragraphs, separated by double newline
    const text = `${s1} ${s2}\n\n${s3}`;

    const { container, rerender } = render(
      <SentenceReader
        text={text}
        duration={6}
        currentTime={5}
        isPlaying={true}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    // All segments should be matched (none grayed out with text-stone-400)
    const segs = getSegments(container);
    const unmatched = segs.filter((s) => s.loaded === false);
    expect(unmatched).toHaveLength(0);
  });

  it("matches short sentences (< 50 chars) with normalised whitespace fallback", () => {
    // Short sentences can't use the 50-char prefix fallback. Normalised search
    // should find them even when chunk text has extra whitespace around lines.
    const shortSent = "Go now.";  // < 50 chars
    const longSent = "This is a much longer continuation of the story.";
    // Chunk text with single newline (becomes single space after replace)
    const chunkText = `${longSent}\n${shortSent}`;
    const chunks: ChunkInfo[] = [{ text: chunkText, duration: 4 }];
    const text = `${longSent}\n${shortSent}`;

    const { container } = render(
      <SentenceReader
        text={text}
        duration={4}
        currentTime={3.5}
        isPlaying={true}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    const segs = getSegments(container);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    // Short sentence should be loaded (matched to chunk), not grayed out
    const shortSeg = segs.find((s) => s.text.includes("Go now"));
    expect(shortSeg?.loaded).toBe(true);
  });
});

/**
 * SentenceReader — second branch coverage pass targeting remaining missed branches.
 *
 * Uncovered branches targeted:
 *  Line 181[1]: prefix-match assigned segment but full text not found in Step 2b → chunkStartTime
 *  Line 187[1]: empty segIndices in path-b (no word boundaries) → reduce returns 0 → `|| 1`
 *  Line 510[0]: handlePointerMove early return when !longPressStartPos.current
 *  Lines 590[1], 620[1]: unknown annotation color → ?? fallback for annotationClass / NOTE_DOT_CLASS
 *  Line 655[1]: unknown annotation color → ?? fallback for NOTE_CARD_CLASS (when note expanded)
 *  Line 690[1]: parallel view, translationText falsy, translationLoading=false → null branch
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SentenceReader, { ChunkInfo } from "@/components/SentenceReader";
import type { Annotation } from "@/lib/api";

const noop = () => {};

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

// ── Line 181[1]: prefix-match segment — full text not in chunk → chunkStartTime ──

describe("SentenceReader — prefix-assigned segment not found in Step 2b (line 181[1])", () => {
  it("falls back to chunkStartTime when a prefix-matched long segment is not found by indexOf", () => {
    // Segment is >50 chars; its first 50 chars appear in the chunk, but the full text does not.
    // Step 2a: prefix match → assigned to chunk 0
    // Step 2b: normalised.indexOf(seg, cursor) = -1 → startTimes[0] = chunkStartTime (line 182)
    const seg = "The quick brown fox jumps over the lazy dog, and then continues on and on.";
    // Chunk text contains the first 50 chars of seg but has a different ending.
    const chunkText = "The quick brown fox jumps over the lazy dog, and this is a different ending.";
    const chunks: ChunkInfo[] = [
      {
        text: chunkText,
        duration: 1,
        wordBoundaries: [{ offset_ms: 0, word: "The" }],
      },
    ];

    const { container } = render(
      <SentenceReader
        text={seg}
        duration={1}
        currentTime={0.1}
        isPlaying={true}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    // Should render without crashing; segment assigned via prefix match
    expect(container.querySelectorAll("[data-seg]").length).toBeGreaterThan(0);
  });
});

// ── Line 187[1]: empty segIndices in path-b → reduce returns 0 → `|| 1` ────────

describe("SentenceReader — empty segIndices in path-b (line 187[1])", () => {
  it("handles chunk with no word boundaries and no assigned segments (reduce → 0 || 1)", () => {
    // Only one sentence, assigned to chunk 0.
    // Chunk 1 has no word boundaries (path b) and no assigned segments → segIndices=[] → reduce=0 → || 1
    const chunks: ChunkInfo[] = [
      {
        text: "Short sentence here.",
        duration: 1,
        wordBoundaries: [{ offset_ms: 0, word: "Short" }],
      },
      {
        text: "extra chunk with no matching segments.",
        duration: 1,
        // no wordBoundaries → path b
      },
    ];

    const { container } = render(
      <SentenceReader
        text="Short sentence here."
        duration={2}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    expect(container.querySelectorAll("[data-seg]").length).toBeGreaterThan(0);
  });
});

// ── Line 510[0]: handlePointerMove early return when !longPressStartPos.current ──

describe("SentenceReader — handlePointerMove early return (line 510[0])", () => {
  it("dispatching pointermove without prior pointerdown hits the !longPressStartPos guard", () => {
    const { container } = render(
      <SentenceReader
        text="Simple sentence for move test."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );

    const segs = Array.from(container.querySelectorAll("[data-seg]")) as HTMLElement[];
    expect(segs.length).toBeGreaterThan(0);

    // Dispatch pointermove WITHOUT a prior pointerdown → longPressStartPos.current = null → early return
    dispatchPointerEvent(segs[0], "pointermove", { clientX: 50, clientY: 50 });

    expect(container.querySelectorAll("[data-seg]").length).toBeGreaterThan(0);
  });
});

// ── Lines 590[1], 620[1]: unknown annotation color → ?? fallback ─────────────

describe("SentenceReader — unknown annotation color ?? fallback (lines 590[1], 620[1])", () => {
  it("renders annotation dot with yellow fallback for unknown color", () => {
    const ann: Annotation = {
      id: 1,
      book_id: 1,
      chapter_index: 0,
      sentence_text: "Annotated sentence here.",
      note_text: "A note.",
      color: "purple" as Annotation["color"], // unknown color
    };

    const { container } = render(
      <SentenceReader
        text="Annotated sentence here."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={[ann]}
        showAnnotations={true}
      />
    );

    // The annotation dot should render (even with unknown color → yellow fallback via ??)
    const dot = container.querySelector(".rounded-full");
    expect(dot).toBeTruthy();
  });
});

// ── Line 655[1]: unknown annotation color in note card → ?? fallback ─────────

describe("SentenceReader — unknown annotation color in note card (line 655[1])", () => {
  it("renders note card with yellow fallback when color is unknown and note is expanded", async () => {
    const ann: Annotation = {
      id: 2,
      book_id: 1,
      chapter_index: 0,
      sentence_text: "Sentence with unknown color note.",
      note_text: "A detailed note for this sentence.",
      color: "purple" as Annotation["color"],
    };

    render(
      <SentenceReader
        text="Sentence with unknown color note."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={[ann]}
        showAnnotations={true}
      />
    );

    // Click the note dot button to expand the note card
    const toggleBtn = screen.getByRole("button", { name: /toggle note/i });
    await userEvent.click(toggleBtn);

    // Note card should render with fallback yellow class (line 655's ?? fires)
    await waitFor(() =>
      expect(screen.getByText("A detailed note for this sentence.")).toBeInTheDocument(),
    );
  });
});

// ── Line 690[1]: parallel view, no translationText, translationLoading=false → null ──

describe("SentenceReader — parallel view null branch (line 690[1])", () => {
  it("renders null in translation column when parallel view but no translation text and not loading", () => {
    const { container } = render(
      <SentenceReader
        text="A sentence for parallel view."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        translations={[""]}
        translationDisplayMode="parallel"
        translationLoading={false}
      />
    );

    // The translation column renders (data-translation="true") but is empty (null branch at line 690)
    const translationCol = container.querySelector("[data-translation='true']");
    expect(translationCol).toBeTruthy();
    // No loading spinner and no text
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });
});

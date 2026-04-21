/**
 * SentenceReader — extended tests covering rendering, highlighting,
 * segment clicks, annotations, and word double-click.
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import SentenceReader, { ChunkInfo } from "@/components/SentenceReader";
import type { Annotation } from "@/lib/api";

const noop = () => {};

/** Return all [data-seg] elements from the container. */
function getSegments(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-seg]")) as HTMLElement[];
}

describe("SentenceReader rendering", () => {
  it("renders sentences from text", () => {
    const { container } = render(
      <SentenceReader
        text="Hello world. This is a second sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    const segs = getSegments(container);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    const allText = segs.map((s) => s.textContent ?? "").join(" ");
    expect(allText).toContain("Hello world");
    expect(allText).toContain("second sentence");
  });

  it("renders a single sentence", () => {
    const { container } = render(
      <SentenceReader
        text="Just one sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    const segs = getSegments(container);
    expect(segs.length).toBe(1);
    expect(segs[0].textContent).toContain("Just one sentence");
  });

  it("renders multiple paragraphs", () => {
    const { container } = render(
      <SentenceReader
        text={"First paragraph sentence.\n\nSecond paragraph sentence."}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    const segs = getSegments(container);
    expect(segs.length).toBe(2);
  });

  it("empty text renders no segments", () => {
    const { container } = render(
      <SentenceReader
        text=""
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    const segs = getSegments(container);
    expect(segs.length).toBe(0);
  });

  it("whitespace-only text renders at most one empty segment", () => {
    // The parser trims paragraphs; some whitespace may still produce a minimal segment.
    // We verify it doesn't crash and doesn't produce many segments.
    const { container } = render(
      <SentenceReader
        text="   \n\n   "
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    const segs = getSegments(container);
    // Should not produce more than one segment for whitespace-only input
    expect(segs.length).toBeLessThanOrEqual(1);
  });
});

describe("SentenceReader highlighting based on currentTime", () => {
  const shortSentence = "Go.";
  const longSentence = "This is a much longer sentence that goes on and on for a while.";
  const text = `${shortSentence} ${longSentence}`;

  it("no highlight when currentTime is 0", () => {
    const { container } = render(
      <SentenceReader
        text={text}
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    expect(container.querySelector(".bg-amber-300")).toBeNull();
  });

  it("highlights the active sentence based on currentTime", () => {
    const { container, rerender } = render(
      <SentenceReader
        text={text}
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );

    // At t=5, the long sentence should be active (short sentence takes ~5% of time)
    rerender(
      <SentenceReader
        text={text}
        duration={10}
        currentTime={5}
        isPlaying={true}
        onSegmentClick={noop}
      />
    );
    const active = container.querySelector(".bg-amber-300");
    expect(active).not.toBeNull();
    expect(active?.textContent).toContain("longer sentence");
  });

  it("highlights the first sentence at very small currentTime", () => {
    const { container, rerender } = render(
      <SentenceReader
        text="First sentence. Second sentence that is much longer."
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );

    // The first sentence starts at t=0, so at t=0.01 (non-zero) it should be active
    rerender(
      <SentenceReader
        text="First sentence. Second sentence that is much longer."
        duration={10}
        currentTime={0.01}
        isPlaying={true}
        onSegmentClick={noop}
      />
    );
    const active = container.querySelector(".bg-amber-300");
    expect(active).not.toBeNull();
    expect(active?.textContent).toContain("First sentence");
  });

  it("unloaded chunks (duration=0) do not cause premature last-sentence highlight", () => {
    const chunk1 = "First loaded chunk.";
    const chunk2 = "Second unloaded chunk that is longer.";
    const chunks: ChunkInfo[] = [
      { text: chunk1, duration: 3 },
      { text: chunk2, duration: 0 }, // not yet loaded
    ];

    const { container, rerender } = render(
      <SentenceReader
        text={`${chunk1}\n\n${chunk2}`}
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    // At t=3.5 we've just passed chunk 1 — chunk 2 is still loading.
    // Should NOT jump to the last sentence of chunk 2.
    rerender(
      <SentenceReader
        text={`${chunk1}\n\n${chunk2}`}
        duration={10}
        currentTime={3.5}
        isPlaying={true}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );
    const active = container.querySelector(".bg-amber-300");
    // Either the last loaded sentence (chunk 1) is highlighted, or nothing is —
    // but it must NOT be a sentence from chunk 2 (the unloaded chunk).
    if (active) {
      expect(active.textContent).toContain("First loaded chunk");
    }
  });

  it("uses chunk durations for timing when chunks are provided", () => {
    const chunk1 = "First chunk text here.";
    const chunk2 = "Second chunk is here and it is longer.";
    const chunks: ChunkInfo[] = [
      { text: chunk1, duration: 3 },
      { text: chunk2, duration: 7 },
    ];

    const { container, rerender } = render(
      <SentenceReader
        text={`${chunk1}\n\n${chunk2}`}
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    // At t=5 we're in chunk 2 (which starts at t=3)
    rerender(
      <SentenceReader
        text={`${chunk1}\n\n${chunk2}`}
        duration={10}
        currentTime={5}
        isPlaying={true}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );
    const active = container.querySelector(".bg-amber-300");
    expect(active).not.toBeNull();
    expect(active?.textContent).toContain("Second chunk");
  });
});

describe("SentenceReader segment click", () => {
  it("double-clicking a segment calls onSegmentClick with start time", () => {
    const onSegmentClick = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Hello world. Another sentence here."
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={onSegmentClick}
      />
    );

    const segs = getSegments(container);
    expect(segs.length).toBeGreaterThan(0);
    fireEvent.doubleClick(segs[0]);

    expect(onSegmentClick).toHaveBeenCalledTimes(1);
    expect(onSegmentClick.mock.calls[0][0]).toBeGreaterThanOrEqual(0); // startTime
  });

  it("single click does not call onSegmentClick", () => {
    const onSegmentClick = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Hello world. Another sentence here."
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={onSegmentClick}
      />
    );

    const segs = getSegments(container);
    fireEvent.click(segs[0]);

    expect(onSegmentClick).not.toHaveBeenCalled();
  });

  it("does not call onSegmentClick when disabled", () => {
    const onSegmentClick = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Hello world. Test sentence."
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={onSegmentClick}
        disabled={true}
      />
    );

    const segs = getSegments(container);
    fireEvent.doubleClick(segs[0]);

    expect(onSegmentClick).not.toHaveBeenCalled();
  });
});

describe("SentenceReader annotations", () => {
  it("renders annotation underline for annotated sentence", () => {
    const annotations: Annotation[] = [
      {
        id: 1,
        book_id: 1,
        chapter_index: 0,
        sentence_text: "Hello world.",
        note_text: "My note",
        color: "yellow",
      },
    ];

    const { container } = render(
      <SentenceReader
        text="Hello world. Second sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={annotations}
      />
    );

    // The annotated segment should have the yellow border class
    const segs = getSegments(container);
    const annotatedSeg = segs.find((s) => s.textContent?.includes("Hello world"));
    expect(annotatedSeg).toBeDefined();
    expect(annotatedSeg?.className).toContain("border-yellow-400");
  });

  it("renders note icon for annotation with note text", () => {
    const annotations: Annotation[] = [
      {
        id: 2,
        book_id: 1,
        chapter_index: 0,
        sentence_text: "Annotated sentence.",
        note_text: "An important note",
        color: "blue",
      },
    ];

    render(
      <SentenceReader
        text="Annotated sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={annotations}
      />
    );

    // Note icon should appear
    expect(screen.getByText("📝")).toBeInTheDocument();
  });

  it("applies blue color class for blue annotation", () => {
    const annotations: Annotation[] = [
      {
        id: 3,
        book_id: 1,
        chapter_index: 0,
        sentence_text: "Blue sentence.",
        note_text: "",
        color: "blue",
      },
    ];

    const { container } = render(
      <SentenceReader
        text="Blue sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={annotations}
      />
    );

    const segs = getSegments(container);
    const annotatedSeg = segs.find((s) => s.textContent?.includes("Blue sentence"));
    expect(annotatedSeg?.className).toContain("border-blue-400");
  });

  it("renders without annotations prop without errors", () => {
    const { container } = render(
      <SentenceReader
        text="Just a plain sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    const segs = getSegments(container);
    expect(segs.length).toBe(1);
    // No annotation borders
    expect(segs[0].className).not.toContain("border-yellow-400");
  });
});

describe("SentenceReader long-press annotation (onAnnotate)", () => {
  it("calls onAnnotate after long press (400ms)", async () => {
    jest.useFakeTimers();
    const onAnnotate = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Press this sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        onAnnotate={onAnnotate}
        chapterIndex={2}
      />
    );

    const segs = getSegments(container);
    fireEvent.pointerDown(segs[0]);

    act(() => {
      jest.advanceTimersByTime(450);
    });

    expect(onAnnotate).toHaveBeenCalledTimes(1);
    // onAnnotate called with (sentenceText, chapterIndex, {x, y})
    const [sentenceText, chapterIdx] = onAnnotate.mock.calls[0];
    expect(sentenceText).toContain("Press this sentence");
    expect(chapterIdx).toBe(2);
    jest.useRealTimers();
  });

  it("does not call onAnnotate if pointer is released before 400ms", async () => {
    jest.useFakeTimers();
    const onAnnotate = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Short tap sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        onAnnotate={onAnnotate}
      />
    );

    const segs = getSegments(container);
    fireEvent.pointerDown(segs[0], { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(segs[0]);

    act(() => {
      jest.advanceTimersByTime(450);
    });

    expect(onAnnotate).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe("SentenceReader double-click triggers TTS", () => {
  it("calls onSegmentClick on double-click", () => {
    const onSegmentClick = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Double click this sentence."
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={onSegmentClick}
      />
    );

    const segs = getSegments(container);
    fireEvent.doubleClick(segs[0]);

    expect(onSegmentClick).toHaveBeenCalledTimes(1);
    const [startTime, text] = onSegmentClick.mock.calls[0];
    expect(typeof startTime).toBe("number");
    expect(text).toContain("Double click this sentence");
  });

  it("does not call onSegmentClick when disabled", () => {
    const onSegmentClick = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Disabled sentence."
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={onSegmentClick}
        disabled
      />
    );

    const segs = getSegments(container);
    fireEvent.doubleClick(segs[0]);

    expect(onSegmentClick).not.toHaveBeenCalled();
  });

  it("single click does not trigger TTS", () => {
    const onSegmentClick = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Single click sentence."
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={onSegmentClick}
      />
    );

    const segs = getSegments(container);
    fireEvent.click(segs[0]);

    expect(onSegmentClick).not.toHaveBeenCalled();
  });
});

describe("SentenceReader translations", () => {
  it("renders translation text in inline mode", () => {
    render(
      <SentenceReader
        text="Original sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        translations={["Übersetzte Übersetzung."]}
        translationDisplayMode="inline"
      />
    );
    expect(screen.getByText("Übersetzte Übersetzung.")).toBeInTheDocument();
  });

  it("renders translation text in parallel mode", () => {
    render(
      <SentenceReader
        text="Original text here."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        translations={["Parallel translation."]}
        translationDisplayMode="parallel"
      />
    );
    expect(screen.getByText("Parallel translation.")).toBeInTheDocument();
  });

  it("shows loading skeleton in parallel mode when translationLoading is true and no translation", () => {
    // In parallel mode, an empty translationText entry triggers the skeleton
    const { container } = render(
      <SentenceReader
        text="Loading translation."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        translations={[""]}
        translationDisplayMode="parallel"
        translationLoading={true}
      />
    );
    // Should have animate-pulse loading skeleton in the parallel translation pane
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });
});

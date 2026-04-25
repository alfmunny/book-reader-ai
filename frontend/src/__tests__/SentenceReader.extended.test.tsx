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

  it("all-zero chunks (none loaded) produce no highlight at all", () => {
    // Exact bug scenario: setAllChunks fires with ALL duration=0 before any chunk
    // loads, then audio starts. ALL segments have Infinity startTime → currentIdx = -1
    // → no sentence should be highlighted.
    const sentences = [
      "First sentence here.",
      "Second sentence here.",
      "Third sentence here.",
      "Fourth sentence is the last one.",
    ];
    const allChunksZero: ChunkInfo[] = sentences.map((t) => ({ text: t, duration: 0 }));
    const fullText = sentences.join("\n\n");

    const { container, rerender } = render(
      <SentenceReader
        text={fullText}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        chunks={allChunksZero}
      />
    );

    // Simulate: audio starts (duration and currentTime become non-zero)
    // before any chunk has loaded its real duration.
    rerender(
      <SentenceReader
        text={fullText}
        duration={20}
        currentTime={0.5}
        isPlaying={true}
        onSegmentClick={noop}
        chunks={allChunksZero}
      />
    );
    // No sentence should be highlighted — all chunks still loading.
    expect(container.querySelector(".bg-amber-300")).toBeNull();
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
    // The loaded chunk must be highlighted — not null, and not from the unloaded chunk.
    expect(active).not.toBeNull();
    expect(active!.textContent).toContain("First loaded chunk");
    expect(active!.textContent).not.toContain("Second unloaded chunk");
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
  it("single click calls onSegmentClick when TTS is playing (seek)", () => {
    const onSegmentClick = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Hello world. Another sentence here."
        duration={10}
        currentTime={0}
        isPlaying={true}
        onSegmentClick={onSegmentClick}
      />
    );

    const segs = getSegments(container);
    expect(segs.length).toBeGreaterThan(0);
    fireEvent.click(segs[0]);

    expect(onSegmentClick).toHaveBeenCalledTimes(1);
    expect(onSegmentClick.mock.calls[0][0]).toBeGreaterThanOrEqual(0); // startTime
  });

  it("single click does not call onSegmentClick when TTS is idle", () => {
    const onSegmentClick = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Hello world. Another sentence here."
        duration={0}
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

  it("shows collapsible note toggle for annotation with note text", () => {
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

    // Note dot button should appear on the annotated segment
    expect(screen.getByRole("button", { name: /^Toggle note for:/i })).toBeInTheDocument();
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


describe("SentenceReader click interactions", () => {
  it("single click does nothing when TTS is idle", () => {
    const onSegmentClick = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Click this sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={onSegmentClick}
      />
    );

    const segs = getSegments(container);
    fireEvent.click(segs[0]);

    expect(onSegmentClick).not.toHaveBeenCalled();
  });

  it("single click calls onSegmentClick when TTS is playing (seek)", () => {
    const onSegmentClick = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Seekable sentence."
        duration={10}
        currentTime={0}
        isPlaying={true}
        onSegmentClick={onSegmentClick}
      />
    );

    const segs = getSegments(container);
    fireEvent.click(segs[0]);

    expect(onSegmentClick).toHaveBeenCalledTimes(1);
  });

  it("click does not fire when disabled", () => {
    const onSegmentClick = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Disabled sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={onSegmentClick}
        disabled
      />
    );

    const segs = getSegments(container);
    fireEvent.click(segs[0]);

    expect(onSegmentClick).not.toHaveBeenCalled();
  });

  it("click does not fire when user has made a text selection (drag-to-select)", () => {
    const onSegmentClick = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Select this text."
        duration={10}
        currentTime={5}
        isPlaying={true}
        onSegmentClick={onSegmentClick}
      />
    );

    const origGetSelection = window.getSelection;
    window.getSelection = () => ({ toString: () => "Select this" } as Selection);

    const segs = getSegments(container);
    fireEvent.click(segs[0]);

    window.getSelection = origGetSelection;

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

describe("SentenceReader long-sentence chunk spanning", () => {
  // Regression test for: sentences longer than one TTS chunk (~400 chars) caused
  // the chunk-segment matching loop to exhaust all chunks, leaving the long sentence
  // AND all subsequent sentences with startTime=Infinity (never highlighted).
  it("sentences after a cross-chunk sentence are still highlighted", () => {
    const SHORT = "Call me Ishmael.";
    // Build a sentence that is definitely > 400 chars so it can't fit in one chunk.
    const LONG =
      "Whenever I find myself growing grim about the mouth; whenever it is a damp, " +
      "drizzly November in my soul; whenever I find myself involuntarily pausing " +
      "before coffin warehouses, and bringing up the rear of every funeral I meet; " +
      "and especially whenever my hypos get such an upper hand of me, that it " +
      "requires a strong moral principle to prevent me from deliberately stepping " +
      "into the street, and methodically knocking people's hats off.";
    // ~418 chars — longer than a 400-char chunk
    expect(LONG.length).toBeGreaterThan(400);

    const AFTER = "This is my substitute for pistol and ball.";

    // Simulate how the TTS backend splits text: chunk1 ends mid-LONG sentence.
    const chunk1Text = SHORT + "\n" + LONG.slice(0, 350);
    const chunk2Text = LONG.slice(350) + "\n" + AFTER;

    const chunks: ChunkInfo[] = [
      { text: chunk1Text, duration: 7 },
      { text: chunk2Text, duration: 4 },
    ];

    // Text contains all three sentences; the segmenter will produce [SHORT, LONG, AFTER].
    const fullText = `${SHORT}\n\n${LONG}\n\n${AFTER}`;

    const { container, rerender } = render(
      <SentenceReader
        text={fullText}
        duration={11}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    // At t=8 we are in chunk2 (starts at t=7). AFTER should be highlighted.
    // Without the fix, LONG exhausts the chunk list, AFTER also gets Infinity → nothing
    // highlights after sentence 1.
    rerender(
      <SentenceReader
        text={fullText}
        duration={11}
        currentTime={8}
        isPlaying={true}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    const active = container.querySelector(".bg-amber-300");
    expect(active).not.toBeNull();
    expect(active?.textContent).toContain("substitute for pistol");
  });

  it("the long sentence itself gets a finite startTime and is highlighted", () => {
    const SHORT = "Short opener.";
    const LONG =
      "This is a very long sentence that deliberately exceeds the four-hundred " +
      "character chunk boundary so that the text-to-speech backend is forced to " +
      "split it across two consecutive audio chunks, which previously caused the " +
      "entire sentence highlighting system to freeze because indexOf could never " +
      "find the complete sentence text inside any single chunk of audio data, " +
      "leaving every subsequent sentence permanently un-highlighted no matter how much time elapsed.";
    expect(LONG.length).toBeGreaterThan(400);

    const AFTER = "Trailing sentence.";

    const chunk1Text = SHORT + "\n" + LONG.slice(0, 350);
    const chunk2Text = LONG.slice(350) + "\n" + AFTER;

    const chunks: ChunkInfo[] = [
      { text: chunk1Text, duration: 5 },
      { text: chunk2Text, duration: 5 },
    ];

    const fullText = `${SHORT}\n\n${LONG}\n\n${AFTER}`;

    const { container, rerender } = render(
      <SentenceReader
        text={fullText}
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    // At t=1, SHORT is done and LONG should be active (it starts very early in chunk1)
    rerender(
      <SentenceReader
        text={fullText}
        duration={10}
        currentTime={1}
        isPlaying={true}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    const active = container.querySelector(".bg-amber-300");
    expect(active).not.toBeNull();
    // Either SHORT or LONG is active — both are from chunk1, so a finite startTime was assigned.
    // The important invariant: the system did NOT freeze (active is not null).
    expect(
      active?.textContent?.includes("Short opener") ||
      active?.textContent?.includes("very long sentence")
    ).toBe(true);
  });
});

describe("SentenceReader annotation substring matching", () => {
  it("highlights a segment when annotation.sentence_text is a substring of the segment", () => {
    // Simulates annotations created via text-selection: stored text is a fragment of the full sentence.
    const segmentText = "She came back from my watches below, and reported no vessel in sight.";
    const annotations: Annotation[] = [
      {
        id: 10,
        book_id: 1,
        chapter_index: 0,
        sentence_text: "ck from my watches below, and reported no vessel",
        note_text: "",
        color: "green",
      },
    ];

    const { container } = render(
      <SentenceReader
        text={segmentText}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={annotations}
      />
    );

    const segs = getSegments(container);
    const annotatedSeg = segs.find((s) => s.textContent?.includes("She came back"));
    expect(annotatedSeg).toBeDefined();
    // Per #1410: substring annotations underline the matched substring only,
    // not the full segment span. So the wrapper must NOT carry the underline,
    // but a child element should.
    expect(annotatedSeg?.className).not.toContain("border-green-400");
    const inner = annotatedSeg?.querySelector(".border-green-400");
    expect(inner).not.toBeNull();
    expect(inner?.textContent).toContain("watches below");
  });

  it("exact-match annotation still works after substring fallback added", () => {
    const annotations: Annotation[] = [
      {
        id: 11,
        book_id: 1,
        chapter_index: 0,
        sentence_text: "Exact match sentence.",
        note_text: "",
        color: "pink",
      },
    ];

    const { container } = render(
      <SentenceReader
        text="Exact match sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={annotations}
      />
    );

    const segs = getSegments(container);
    const annotatedSeg = segs.find((s) => s.textContent?.includes("Exact match"));
    expect(annotatedSeg).toBeDefined();
    expect(annotatedSeg?.className).toContain("border-pink-400");
  });

  it("short annotation text (<10 chars) does NOT match via substring", () => {
    // The minimum length guard prevents spurious matches from very short fragments.
    const annotations: Annotation[] = [
      {
        id: 12,
        book_id: 1,
        chapter_index: 0,
        sentence_text: "short",
        note_text: "",
        color: "yellow",
      },
    ];

    const { container } = render(
      <SentenceReader
        text="This sentence contains the word short somewhere."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={annotations}
      />
    );

    const segs = getSegments(container);
    const seg = segs.find((s) => s.textContent?.includes("contains the word"));
    expect(seg).toBeDefined();
    expect(seg?.className).not.toContain("border-yellow-400");
  });

  it("shows note toggle for annotation matched via substring", () => {
    const segmentText = "She came back from my watches below, and reported no vessel in sight.";
    const annotations: Annotation[] = [
      {
        id: 13,
        book_id: 1,
        chapter_index: 0,
        sentence_text: "ck from my watches below, and reported no vessel",
        note_text: "Important passage",
        color: "blue",
      },
    ];

    render(
      <SentenceReader
        text={segmentText}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={annotations}
      />
    );

    expect(screen.getByRole("button", { name: /^Toggle note for:/i })).toBeInTheDocument();
  });
});

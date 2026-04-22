/**
 * SentenceReader — timing estimation tests
 *
 * Verifies that character-count-based proportional timing distributes
 * segment start times correctly within a TTS chunk.
 */
import React from "react";
import { render } from "@testing-library/react";
import SentenceReader, { ChunkInfo } from "@/components/SentenceReader";

const noop = () => {};

/** Find data-seg attributes and the text content of each segment span. */
function getSegments(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-seg]")).map((el) => ({
    idx: Number((el as HTMLElement).dataset.seg),
    text: el.textContent ?? "",
  }));
}

describe("SentenceReader timing estimation", () => {
  it("renders all segments without crashing", () => {
    const text = "Short sentence. A much longer sentence that takes more time to say.";
    const { container } = render(
      <SentenceReader
        text={text}
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );
    const segs = getSegments(container);
    expect(segs.length).toBeGreaterThanOrEqual(2);
  });

  it("active segment is highlighted when currentTime matches", () => {
    // Two sentences; total duration 10s.
    // With char-count weighting the short sentence gets less time than the long one.
    const shortSentence = "Go.";                        // ~3 chars
    const longSentence = "This is a much longer sentence that goes on and on."; // ~52 chars
    const text = `${shortSentence} ${longSentence}`;

    const { container, rerender } = render(
      <SentenceReader
        text={text}
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );

    // At t=0 nothing should be highlighted (currentTime === 0 → currentIdx = -1)
    expect(container.querySelector(".bg-amber-300")).toBeNull();

    // At t=5 (half-way through) the long sentence should be active, not the short one,
    // because the short sentence gets ~3/(3+52) ≈ 5.4% of 10s ≈ 0.55s.
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

  it("uses chunk durations when chunks are provided", () => {
    const chunk1 = "First chunk sentence.";
    const chunk2 = "Second chunk sentence.";
    const chunks: ChunkInfo[] = [
      { text: chunk1, duration: 4 },
      { text: chunk2, duration: 6 },
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

    // At t=5 we should be in chunk 2 (starts at t=4)
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
    expect(active?.textContent).toContain("Second chunk");
  });

  it("highlight advances past a mid-sequence Infinity segment (unloaded middle chunk)", () => {
    // Regression: when a middle chunk has duration=0 (not yet loaded), its segments
    // get startTime=Infinity. The previous `else break` in currentIdx caused the
    // highlight to freeze on the last loaded segment before that Infinity.
    // Setup: chunk 0 loaded (2s), chunk 1 NOT loaded (0s), chunk 2 loaded (2s).
    // At t=2.5 the highlight should advance to "Third sentence" (chunk 2),
    // not stay frozen on "First sentence" (chunk 0).
    const sentA = "First sentence here.";
    const sentB = "Middle sentence here.";
    const sentC = "Third sentence here.";
    // Separate paragraphs so each sentence is its own chunk
    const text = `${sentA}\n\n${sentB}\n\n${sentC}`;
    const chunks: ChunkInfo[] = [
      { text: sentA, duration: 2 },   // loaded
      { text: sentB, duration: 0 },   // NOT yet loaded — startTime = Infinity
      { text: sentC, duration: 2 },   // loaded; starts at chunkStartTime = 2
    ];

    const { container, rerender } = render(
      <SentenceReader
        text={text}
        duration={4}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    // Without the fix, highlight freezes on sentA at t=2.5 (else-break stops at Infinity).
    // With the fix, sentC (startTime=2) is correctly highlighted.
    rerender(
      <SentenceReader
        text={text}
        duration={4}
        currentTime={2.5}
        isPlaying={true}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );
    const active = container.querySelector(".bg-amber-300");
    expect(active?.textContent).toContain("Third sentence");
  });

  it("handles \\r\\n line endings in chunk text without breaking indexOf matching", () => {
    // Regression: chunks[].text.replace(/\n/g, " ") left \\r, causing indexOf
    // to fail for segments after Windows-style line endings in Gutenberg text.
    const sentA = "Il avait les cheveux.";
    const sentB = "Quoiqu il ne fut pas.";
    // Simulate Windows \\r\\n inside the chunk text (as if the source file had CRLF)
    const chunkWithCrlf = `${sentA}\r\n${sentB}`;
    const chunks: ChunkInfo[] = [{ text: chunkWithCrlf, duration: 4 }];
    const text = `${sentA}\n${sentB}`;  // same text, Unix line endings

    const { container, rerender } = render(
      <SentenceReader
        text={text}
        duration={4}
        currentTime={3}
        isPlaying={true}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    rerender(
      <SentenceReader
        text={text}
        duration={4}
        currentTime={3}
        isPlaying={true}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );
    // Both sentences should be matched; at t=3 the second sentence should be highlighted.
    const active = container.querySelector(".bg-amber-300");
    expect(active?.textContent).toContain("Quoiqu");
  });

  it("cascade guard: sentence spanning chunk boundary does not grey out subsequent sentences", () => {
    // Regression for issue #401: a short sentence that spans a chunk boundary
    // (i.e. starts at the end of chunk 0 and ends in chunk 1) fails ALL matching
    // attempts — exact, prefix (< 50 chars), and normalized. Previously chunkIdx
    // advanced to chunks.length causing ALL subsequent segments to get chunkIdx=-1
    // (greyed out). The cascade guard resets chunkIdx so later sentences are found.
    //
    // Simulate: chunk 0 ends mid-sentence; chunk 1 has the rest. The segment text
    // is assembled from both halves (not present in either chunk alone).
    const sentA = "You will rejoice to hear that no disaster has accompanied us."; // in chunk 0
    const crossBoundarySent = "Go."; // short, starts end-of-chunk-0, ends chunk-1 → not in either
    const sentC = "I arrived here yesterday with great relief."; // in chunk 1

    // chunk 0 contains sentA and the very beginning of crossBoundarySent ("Go")
    // chunk 1 contains the end of crossBoundarySent (".") and sentC
    const chunk0 = `${sentA} Go`;              // "Go" not terminated → not findable as "Go."
    const chunk1 = `.\n${sentC}`;             // ends with "." but "Go." spans the boundary

    const chunks: ChunkInfo[] = [
      { text: chunk0, duration: 5 },
      { text: chunk1, duration: 5 },
    ];

    // Chapter text: all three sentences as one block
    const text = `${sentA} ${crossBoundarySent} ${sentC}`;

    const { container } = render(
      <SentenceReader
        text={text}
        duration={10}
        currentTime={8}  // well into chunk 1 where sentC should be active
        isPlaying={true}
        onSegmentClick={noop}
        chunks={chunks}
      />
    );

    // sentC must NOT be greyed out — the cascade guard should have kept chunkIdx
    // in range so sentC is matched to chunk 1.
    const allSegs = Array.from(container.querySelectorAll("[data-seg]"));
    const sentCEl = allSegs.find((el) => el.textContent?.includes("arrived here yesterday"));
    // Must be found and not have the grey class
    expect(sentCEl).not.toBeNull();
    expect(sentCEl?.className).not.toContain("text-stone-400");
  });
});

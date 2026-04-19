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
});

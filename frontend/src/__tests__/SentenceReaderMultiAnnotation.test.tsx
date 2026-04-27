/**
 * Regression tests for #1707:
 *
 *   1. Two sub-sentence annotations in the same segment must BOTH render
 *      visibly. Pre-fix only the first match returned by Array.find rendered.
 *   2. A click on a non-annotated word in the same segment must NOT route to
 *      the existing annotation's onAnnotationClick (it should fall through to
 *      the segment-click path so a new selection / new highlight can begin).
 *   3. A click on a specific annotated span must route to THAT annotation's
 *      onAnnotationClick, not whichever `find()` happens to return first.
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";
import type { Annotation } from "@/lib/api";

const noop = () => {};

const sentence = "It was a lonely glade beneath the silent oaks at dawn.";

const annA: Annotation = {
  id: 1,
  book_id: 1,
  chapter_index: 0,
  sentence_text: "lonely glade",
  note_text: null,
  color: "yellow",
};

const annB: Annotation = {
  id: 2,
  book_id: 1,
  chapter_index: 0,
  sentence_text: "silent oaks",
  note_text: null,
  color: "blue",
};

describe("SentenceReader multi-annotation rendering (closes #1707)", () => {
  it("renders BOTH sub-sentence annotation spans inside the same segment", () => {
    const { container } = render(
      <SentenceReader
        text={sentence}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={[annA, annB]}
      />,
    );
    const yellow = container.querySelector(".border-b-2.border-yellow-400");
    const blue = container.querySelector(".border-b-2.border-blue-400");
    expect(yellow).not.toBeNull();
    expect(blue).not.toBeNull();
    expect(yellow?.textContent).toBe("lonely glade");
    expect(blue?.textContent).toBe("silent oaks");
  });
});

describe("SentenceReader click routing with multiple annotations (closes #1707)", () => {
  it("clicking annotation B's span dispatches onAnnotationClick with annotation B", () => {
    const onAnn = jest.fn();
    const { container } = render(
      <SentenceReader
        text={sentence}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={[annA, annB]}
        onAnnotationClick={onAnn}
      />,
    );
    const blueSpan = container.querySelector(".border-b-2.border-blue-400") as HTMLElement;
    expect(blueSpan).not.toBeNull();
    fireEvent.click(blueSpan, { clientX: 0, clientY: 0 });
    expect(onAnn).toHaveBeenCalledTimes(1);
    expect(onAnn.mock.calls[0][0]).toMatchObject({ id: 2, sentence_text: "silent oaks" });
  });

  it("clicking annotation A's span dispatches onAnnotationClick with annotation A", () => {
    const onAnn = jest.fn();
    const { container } = render(
      <SentenceReader
        text={sentence}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={[annA, annB]}
        onAnnotationClick={onAnn}
      />,
    );
    const yellowSpan = container.querySelector(".border-b-2.border-yellow-400") as HTMLElement;
    fireEvent.click(yellowSpan, { clientX: 0, clientY: 0 });
    expect(onAnn).toHaveBeenCalledTimes(1);
    expect(onAnn.mock.calls[0][0]).toMatchObject({ id: 1, sentence_text: "lonely glade" });
  });

  it("clicking on the segment OUTSIDE any annotation span does NOT call onAnnotationClick", () => {
    const onAnn = jest.fn();
    const { container } = render(
      <SentenceReader
        text={sentence}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={[annA, annB]}
        onAnnotationClick={onAnn}
      />,
    );
    // Click directly on the wrapping segment span (not on any annotation child).
    const segSpan = container.querySelector("[data-seg]") as HTMLElement;
    expect(segSpan).not.toBeNull();
    fireEvent.click(segSpan, { clientX: 0, clientY: 0 });
    expect(onAnn).not.toHaveBeenCalled();
  });
});

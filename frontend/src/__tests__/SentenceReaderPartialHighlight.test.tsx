/**
 * Regression for #1410: a sub-sentence annotation must render as a substring
 * underline, not a full-segment underline. Pairs with the SelectionToolbar fix
 * that now stores the user's actual selection as sentence_text.
 */
import React from "react";
import { render } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";
import type { Annotation } from "@/lib/api";

const noop = () => {};

describe("SentenceReader partial annotation rendering (closes #1410)", () => {
  it("substring annotation does NOT underline the whole segment span", () => {
    const sentence = "It was a lonely glade beneath the oaks.";
    const annotations: Annotation[] = [
      {
        id: 1,
        book_id: 1,
        chapter_index: 0,
        sentence_text: "lonely glade beneath",
        note_text: null,
        color: "yellow",
      },
    ];

    const { container } = render(
      <SentenceReader
        text={sentence}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={annotations}
      />,
    );

    const segSpan = container.querySelector("[data-seg]") as HTMLElement;
    expect(segSpan).not.toBeNull();
    // Wrapping span MUST NOT carry the annotation underline class
    expect(segSpan.className).not.toMatch(/border-b-2/);
    // The substring "lonely glade beneath" must be wrapped with the
    // annotation color class somewhere inside the segment.
    const inner = segSpan.querySelector(".border-b-2.border-yellow-400");
    expect(inner).not.toBeNull();
    expect(inner?.textContent).toBe("lonely glade beneath");
  });

  it("full-sentence annotation underlines the whole segment span (unchanged)", () => {
    const sentence = "Full sentence text.";
    const annotations: Annotation[] = [
      {
        id: 2,
        book_id: 1,
        chapter_index: 0,
        sentence_text: "Full sentence text.",
        note_text: null,
        color: "blue",
      },
    ];

    const { container } = render(
      <SentenceReader
        text={sentence}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        annotations={annotations}
      />,
    );

    const segSpan = container.querySelector("[data-seg]") as HTMLElement;
    expect(segSpan.className).toMatch(/border-b-2/);
    expect(segSpan.className).toMatch(/border-blue-400/);
  });
});

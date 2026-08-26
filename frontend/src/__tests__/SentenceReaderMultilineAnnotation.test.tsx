/**
 * Regression (owner report, 2026-08-26): a note whose selection spans a verse
 * line break ("Drum hab ich mich der Magie ergeben,\nOb mir durch Geistes
 * Kraft...") rendered NOTHING — in verse each line is its own segment, and
 * the single-segment anchor found no segment containing the multi-line text.
 *
 * Multi-line annotations now split into per-line pieces: each piece anchors
 * to its own segment and renders there; jump/flash anchors by the first line.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";
import type { Annotation } from "@/lib/api";

const noop = () => {};

const TEXT =
  "Drum hab ich mich der Magie ergeben,\nOb mir durch Geistes Kraft und Mund\nNicht manch Geheimnis würde kund;";

const MULTILINE: Annotation = {
  id: 79,
  book_id: 2229,
  chapter_index: 3,
  sentence_text: "Drum hab ich mich der Magie ergeben,\nOb mir durch Geistes Kraft und Mund",
  note_text: "對知識和宇宙真相的渴望",
  color: "yellow",
};

function renderReader(props: Partial<React.ComponentProps<typeof SentenceReader>> = {}) {
  return render(
    <SentenceReader
      text={TEXT}
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={noop}
      annotations={[MULTILINE]}
      onAnnotationClick={noop}
      {...props}
    />,
  );
}

test("a line-spanning annotation renders a piece in each of its segments", () => {
  const { container } = renderReader();
  const marked = Array.from(
    container.querySelectorAll('[data-ann-id="79"], [data-seg].border-b-2'),
  );
  const textContent = marked.map((el) => el.textContent).join(" | ");
  expect(textContent).toContain("Magie ergeben");
  expect(textContent).toContain("Geistes Kraft und Mund");
  // The third line is NOT part of the annotation
  expect(textContent).not.toContain("Geheimnis");
});

test("clicking any piece opens the annotation", () => {
  const onAnnotationClick = jest.fn();
  const { container } = renderReader({ onAnnotationClick });
  // Full-line pieces render as wrapped, interactive segments
  const pieces = Array.from(container.querySelectorAll('[data-seg][role="button"]'));
  expect(pieces.length).toBe(2);
  fireEvent.click(pieces[1] as HTMLElement); // the SECOND line also opens it
  expect(onAnnotationClick).toHaveBeenCalledWith(
    expect.objectContaining({ id: 79 }),
    expect.anything(),
  );
});

test("jumping to a multi-line sentence flashes the first line's segment", () => {
  const { container } = renderReader({ scrollTargetSentence: MULTILINE.sentence_text });
  const flashed = container.querySelector("[data-seg].ring-amber-400");
  expect(flashed).not.toBeNull();
  expect(flashed?.textContent).toContain("Magie ergeben");
});

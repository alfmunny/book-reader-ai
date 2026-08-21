/**
 * Regression (owner report, 2026-08-21): an annotation on "unbegreiflich" in
 * Faust's Prolog rendered its underline AND note dot on BOTH lines containing
 * that word — annotations anchor by text, and the substring matcher attached
 * them to every containing segment. Each annotation must anchor to exactly
 * ONE segment: an exact segment match wins, otherwise the first segment
 * containing its sentence_text.
 */
import React from "react";
import { render } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";
import type { Annotation } from "@/lib/api";

const noop = () => {};

// Two verse lines that both contain the annotated word (Faust Prolog shape)
const text =
  "die unbegreiflich hohen Werke\nSind herrlich wie am ersten Tag.\n\nUnd schnell und unbegreiflich schnelle\nDreht sich umher der Erde Pracht;";

const wordAnnotation: Annotation = {
  id: 7,
  book_id: 2229,
  chapter_index: 2,
  sentence_text: "unbegreiflich",
  note_text: "A lot of note taking is happening.",
  color: "yellow",
};

function renderReader(annotations: Annotation[]) {
  return render(
    <SentenceReader
      text={text}
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={noop}
      annotations={annotations}
      onAnnotationClick={noop}
    />,
  );
}

test("a substring annotation renders in only the FIRST containing segment", () => {
  const { container } = renderReader([wordAnnotation]);
  const spans = container.querySelectorAll("[data-ann-id]");
  expect(spans.length).toBe(1);
  const seg = spans[0].closest("[data-seg]");
  expect(seg?.textContent).toContain("hohen Werke"); // Raphael's line, not Gabriel's
});

test("no note dot renders — notes show in the highlight panel instead", () => {
  // WeChat-style notes (owner request 2026-08-21): the underline itself is
  // the affordance; tapping it opens QuickHighlightPanel with the note.
  const { container } = renderReader([wordAnnotation]);
  expect(container.querySelectorAll("[aria-expanded]").length).toBe(0);
});

test("an exact full-segment annotation still wins over an earlier substring match", () => {
  const exact: Annotation = {
    id: 8,
    book_id: 2229,
    chapter_index: 2,
    sentence_text: "Und schnell und unbegreiflich schnelle",
    note_text: null,
    color: "blue",
  };
  const { container } = renderReader([exact]);
  // Full-segment annotations wrap the whole segment span with the color class
  const wrapped = container.querySelector(".border-b-2.border-blue-400, [data-seg].border-b-2");
  expect(wrapped ?? container.querySelector('[data-seg][role="button"]')).not.toBeNull();
  const interactive = container.querySelectorAll('[data-seg][role="button"]');
  expect(interactive.length).toBe(1);
  expect(interactive[0].textContent).toContain("schnelle");
});

test("multiple sub-sentence annotations in one segment still all render (#1707)", () => {
  const a: Annotation = { id: 1, book_id: 1, chapter_index: 0, sentence_text: "unbegreiflich hohen", note_text: null, color: "yellow" };
  const b: Annotation = { id: 2, book_id: 1, chapter_index: 0, sentence_text: "ersten Tag", note_text: null, color: "blue" };
  const { container } = renderReader([a, b]);
  expect(container.querySelectorAll("[data-ann-id]").length).toBe(2);
});

/**
 * Regression test for #1240: SentenceReader note toggle button must expose
 * aria-expanded so screen readers announce the expanded/collapsed state.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";
import type { Annotation } from "@/lib/api";

const noop = () => {};

const ANNOTATION: Annotation = {
  id: 1,
  book_id: 1,
  chapter_index: 0,
  sentence_text: "It was a bright cold day in April.",
  note_text: "A memorable opening.",
  color: "yellow",
};

function renderWithAnnotation() {
  return render(
    <SentenceReader
      text="It was a bright cold day in April."
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={noop}
      annotations={[ANNOTATION]}
    />,
  );
}

test("note toggle button has aria-expanded=false when note is closed", () => {
  const { container } = renderWithAnnotation();
  const btn = container.querySelector("[aria-label='Toggle note']") as HTMLElement;
  expect(btn).not.toBeNull();
  expect(btn.getAttribute("aria-expanded")).toBe("false");
});

test("note toggle button has aria-expanded=true after clicking", () => {
  const { container } = renderWithAnnotation();
  const btn = container.querySelector("[aria-label='Toggle note']") as HTMLElement;
  fireEvent.click(btn);
  expect(btn.getAttribute("aria-expanded")).toBe("true");
});

test("note toggle button returns to aria-expanded=false after second click", () => {
  const { container } = renderWithAnnotation();
  const btn = container.querySelector("[aria-label='Toggle note']") as HTMLElement;
  fireEvent.click(btn);
  fireEvent.click(btn);
  expect(btn.getAttribute("aria-expanded")).toBe("false");
});

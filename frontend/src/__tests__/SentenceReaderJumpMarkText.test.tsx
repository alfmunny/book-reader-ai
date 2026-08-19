/**
 * Notes/vocab jumps must highlight the specific saved word or selected text
 * inside the target sentence — not just flash the whole sentence.
 *
 * - Notes jump (selection annotation): the selected substring gets a <mark>.
 * - Vocab jump (?word=): the saved word gets a <mark>.
 * - The mark persists after the 2.5s sentence flash clears, so the reader can
 *   still see WHAT was annotated once the ring fades.
 */
import React from "react";
import { render, act } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";

const noop = () => {};

function renderReader(text: string, scrollTargetSentence: string, scrollTargetWord?: string) {
  return render(
    <SentenceReader
      text={text}
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={noop}
      scrollTargetSentence={scrollTargetSentence}
      scrollTargetWord={scrollTargetWord}
    />,
  );
}

afterEach(() => jest.useRealTimers());

test("notes jump: the selected substring is marked inside the flashed sentence", () => {
  const { container } = renderReader(
    "Ihr naht euch wieder, schwankende Gestalten.",
    "euch",
  );
  const mark = container.querySelector("mark");
  expect(mark).not.toBeNull();
  expect(mark?.textContent).toBe("euch");
});

test("notes jump: multi-word selection is marked as one span", () => {
  const { container } = renderReader(
    "Versuch ich wohl, euch diesmal festzuhalten?",
    "euch diesmal festzuhalten",
  );
  const mark = container.querySelector("mark");
  expect(mark).not.toBeNull();
  expect(mark?.textContent).toBe("euch diesmal festzuhalten");
});

test("whole-sentence target: sentence flashes but nothing inside is marked", () => {
  const text = "Die früh sich einst dem trüben Blick gezeigt.";
  const { container } = renderReader(text, text);
  expect(container.querySelector("[data-jump-target]")).not.toBeNull();
  expect(container.querySelector("mark")).toBeNull();
});

test("vocab jump: explicit word param wins over the selection substring", () => {
  const { container } = renderReader(
    "Call me Ishmael. Some years ago I went to sea.",
    "Call me Ishmael.",
    "Ishmael",
  );
  const mark = container.querySelector("mark");
  expect(mark).not.toBeNull();
  expect(mark?.textContent).toBe("Ishmael");
});

test("the mark persists after the sentence flash clears", () => {
  jest.useFakeTimers();
  const { container } = renderReader(
    "Ihr naht euch wieder, schwankende Gestalten.",
    "euch",
  );
  expect(container.querySelector("mark")).not.toBeNull();

  act(() => {
    jest.advanceTimersByTime(2600);
  });

  // Flash (ring + data-jump-target) is gone…
  expect(container.querySelector("[data-jump-target]")).toBeNull();
  // …but the selected-text mark is still visible.
  const mark = container.querySelector("mark");
  expect(mark).not.toBeNull();
  expect(mark?.textContent).toBe("euch");
});

test("mark lands only in the target segment, not in other segments containing the text", () => {
  const { container } = renderReader(
    "The whale surfaced.\n\nAnother whale followed.",
    "whale",
  );
  const marks = container.querySelectorAll("mark");
  expect(marks.length).toBe(1);
});

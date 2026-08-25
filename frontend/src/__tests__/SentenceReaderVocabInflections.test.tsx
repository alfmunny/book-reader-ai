/**
 * Regression (owner report, 2026-08-26): "verhöhnt" was saved to vocabulary,
 * but the reader showed no dotted underline. Saving stores the base form
 * ("verhöhnen", one entry per word family — #2663), while the underline
 * matcher only did exact whole-word matches — so inflected forms in the text
 * never matched their saved lemma.
 *
 * The vocab matcher is now stem-aware: a token matches when it equals the
 * saved word, or when it is the saved word's stem plus a bounded German
 * inflection ending. Short words stay exact-only to avoid false positives.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";

const noop = () => {};

function renderText(text: string, vocab: string[]) {
  const { container } = render(
    <SentenceReader
      text={text}
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={noop}
      vocabWords={new Set(vocab)}
    />,
  );
  return Array.from(container.querySelectorAll(".decoration-dotted")).map(
    (el) => el.textContent,
  );
}

test("saved lemma 'verhöhnen' underlines the inflected 'verhöhnt'", () => {
  const marked = renderText(
    "Und wenn mich auch der ganze Kreis verhöhnt;",
    ["verhöhnen"],
  );
  expect(marked).toEqual(["verhöhnt"]);
});

test("saved noun 'Meer' underlines its declined forms", () => {
  const marked = renderText(
    "Das Meer rauscht. Die Meere sind tief. Des Meeres Stimme.",
    ["meer"],
  );
  expect(marked).toEqual(["Meer", "Meere", "Meeres"]);
});

test("the exact form still matches as before", () => {
  const marked = renderText("Es schäumt das Meer in breiten Flüssen.", ["meer"]);
  expect(marked).toEqual(["Meer"]);
});

test("stems never match inside unrelated longer words", () => {
  // "Meeröffnung" is not a form of "Meer"; "verhören" is not "verhöhnen".
  const marked = renderText(
    "Die Meeröffnung glänzt. Sie wollen ihn verhören.",
    ["meer", "verhöhnen"],
  );
  expect(marked).toEqual([]);
});

test("short saved words stay exact-only", () => {
  // "in" must not fuzzy-match "int", "eine", etc.
  const marked = renderText("Eine internationale Reise in den Süden.", ["in"]);
  expect(marked).toEqual(["in"]);
});

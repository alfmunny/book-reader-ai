/**
 * SentenceReader — coverage for buildSegContent / highlightText (lines 318–376).
 * Tests: targetWord highlight, vocabWords underline, word-boundary matching,
 * deduplication, no matches, partial-word non-match.
 */
import React from "react";
import { render } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";

const noop = () => {};

// Helper: render SentenceReader with a sentence as both text and scrollTargetSentence,
// so buildSegContent receives the targetWord for that segment.
function renderWithTarget(text: string, scrollTargetWord?: string, vocabWords?: Set<string>) {
  return render(
    <SentenceReader
      text={text}
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={noop}
      scrollTargetSentence={text}
      scrollTargetWord={scrollTargetWord}
      vocabWords={vocabWords}
    />,
  );
}

// ── targetWord highlight ───────────────────────────────────────────────────────

test("targetWord is wrapped in a <mark> element with amber bg", () => {
  const { container } = renderWithTarget("Call me Ishmael.", "Ishmael");

  const mark = container.querySelector("mark");
  expect(mark).not.toBeNull();
  expect(mark?.textContent).toBe("Ishmael");
  expect(mark?.className).toContain("bg-amber-300");
  expect(mark?.className).toContain("animate-pulse");
});

test("targetWord match is case-insensitive", () => {
  const { container } = renderWithTarget("The White Whale swam past.", "white whale");

  const mark = container.querySelector("mark");
  expect(mark).not.toBeNull();
  expect(mark?.textContent?.toLowerCase()).toBe("white whale");
});

test("targetWord does not match partial words (word boundary check)", () => {
  const { container } = renderWithTarget("Running is fun.", "run");

  // "run" is not a whole word inside "Running" — no mark expected
  const mark = container.querySelector("mark");
  expect(mark).toBeNull();
});

// ── vocabWords underline ───────────────────────────────────────────────────────

test("vocabWord is wrapped in a <span> with dotted amber underline", () => {
  const { container } = renderWithTarget(
    "The leviathan rose from the deep.",
    undefined,
    new Set(["leviathan"]),
  );

  const underline = container.querySelector("span.underline");
  expect(underline).not.toBeNull();
  expect(underline?.textContent).toBe("leviathan");
  expect(underline?.className).toContain("decoration-amber-400");
});

test("multiple vocabWords in text are all underlined", () => {
  const { container } = renderWithTarget(
    "Whale songs and sea foam.",
    undefined,
    new Set(["whale", "sea"]),
  );

  const underlines = container.querySelectorAll("span.underline");
  expect(underlines.length).toBe(2);
  const words = Array.from(underlines).map((el) => el.textContent?.toLowerCase());
  expect(words).toContain("whale");
  expect(words).toContain("sea");
});

// ── targetWord takes priority over vocabWord (deduplication) ──────────────────

test("when targetWord and vocabWord overlap, targetWord mark wins (no double-wrap)", () => {
  const { container } = renderWithTarget(
    "The whale breached.",
    "whale",
    new Set(["whale"]),
  );

  // Exactly one mark and zero underlines for "whale"
  const marks = container.querySelectorAll("mark");
  expect(marks.length).toBe(1);
  expect(marks[0].textContent).toBe("whale");
  // The word should not also appear in an underline span
  const underlines = container.querySelectorAll("span.underline");
  expect(underlines.length).toBe(0);
});

// ── No matches ────────────────────────────────────────────────────────────────

test("plain text rendered as-is when no targetWord or vocabWords", () => {
  const { container } = renderWithTarget("Plain text with nothing special.");

  expect(container.querySelector("mark")).toBeNull();
  expect(container.querySelector("span.underline")).toBeNull();
  expect(container.textContent).toContain("Plain text with nothing special");
});

test("no highlighting when vocabWords is empty set", () => {
  const { container } = renderWithTarget("Some sentence here.", undefined, new Set());

  expect(container.querySelector("mark")).toBeNull();
});

// ── substring jump-target (text-selection annotations) ───────────────────────

test("segment containing the scrollTargetSentence as a substring gets data-jump-target", () => {
  // Text-selection annotations store a partial sentence; the full segment text
  // must still be matched as a jump target so the scroll works.
  const fullSegment = "It is a truth universally acknowledged, that a single man must be in want.";
  const partialTarget = "universally acknowledged";

  const { container } = render(
    <SentenceReader
      text={fullSegment}
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={() => {}}
      scrollTargetSentence={partialTarget}
    />,
  );

  // The segment should have data-jump-target="true" even though the target is
  // only a substring — this was the bug: exact-equality check missed substrings.
  const jumpTarget = container.querySelector("[data-jump-target]");
  expect(jumpTarget).not.toBeNull();
});

test("short string (< 10 chars) does not trigger substring jump-target to avoid false positives", () => {
  const fullSegment = "It is a truth universally acknowledged.";
  const shortTarget = "truth";  // length 5 < 10

  const { container } = render(
    <SentenceReader
      text={fullSegment}
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={() => {}}
      scrollTargetSentence={shortTarget}
    />,
  );

  // "truth" < 10 chars — should NOT match as jump target (exact match only for short strings)
  const jumpTarget = container.querySelector("[data-jump-target]");
  expect(jumpTarget).toBeNull();
});

// ── Trailing text after last match ────────────────────────────────────────────

test("text after the last match is rendered as plain string", () => {
  const { container } = renderWithTarget(
    "He saw the whale and fled.",
    undefined,
    new Set(["whale"]),
  );

  // "and fled." comes after the match — should still be in the output
  expect(container.textContent).toContain("and fled.");
});

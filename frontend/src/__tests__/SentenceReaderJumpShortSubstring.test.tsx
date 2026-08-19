/**
 * Regression: jumping from the Notes page to an annotation whose sentence_text
 * is a short text-selection substring (e.g. "euch", 4 chars) must still flash
 * and scroll to the containing segment. Previously substring jump-targets
 * required >= 10 chars, so short annotations produced no data-jump-target at
 * all — no scroll, no highlight.
 *
 * New rule (single target): an exact segment match wins; otherwise the FIRST
 * segment containing the target flashes — and only that one, so short strings
 * cannot light up every segment that happens to contain them.
 */
import React from "react";
import { render } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";

const noop = () => {};

function renderReader(text: string, scrollTargetSentence: string) {
  return render(
    <SentenceReader
      text={text}
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={noop}
      scrollTargetSentence={scrollTargetSentence}
    />,
  );
}

test("short substring target (< 10 chars) flashes its containing segment", () => {
  const { container } = renderReader(
    "Ihr naht euch wieder, schwankende Gestalten.\n\nDie früh sich einst dem trüben Blick gezeigt.",
    "euch",
  );
  const jumpTargets = container.querySelectorAll("[data-jump-target]");
  expect(jumpTargets.length).toBe(1);
  expect(jumpTargets[0].textContent).toContain("euch wieder");
});

test("only the FIRST segment containing a short target flashes when several match", () => {
  const { container } = renderReader(
    "The whale surfaced.\n\nAnother whale followed.\n\nNo match here.",
    "whale",
  );
  const jumpTargets = container.querySelectorAll("[data-jump-target]");
  expect(jumpTargets.length).toBe(1);
  expect(jumpTargets[0].textContent).toContain("The whale surfaced");
});

test("exact segment match wins over an earlier segment containing the target", () => {
  const { container } = renderReader(
    "Prefix euch wieder kommen suffix.\n\neuch wieder kommen",
    "euch wieder kommen",
  );
  const jumpTargets = container.querySelectorAll("[data-jump-target]");
  expect(jumpTargets.length).toBe(1);
  expect(jumpTargets[0].textContent?.trim()).toBe("euch wieder kommen");
});

test("long substring target still flashes exactly one segment", () => {
  const { container } = renderReader(
    "It is a truth universally acknowledged, that a single man must be in want.\n\nAnother sentence entirely.",
    "universally acknowledged",
  );
  const jumpTargets = container.querySelectorAll("[data-jump-target]");
  expect(jumpTargets.length).toBe(1);
  expect(jumpTargets[0].textContent).toContain("universally acknowledged");
});

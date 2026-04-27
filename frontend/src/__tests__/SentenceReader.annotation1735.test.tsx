/**
 * Regression #1735: long-press annotation broken after PR #782 removed onAnnotate.
 * Verifies that:
 *   - onAnnotate is called on a 500ms long-press when onWordTap is NOT provided
 *   - onAnnotate is NOT called when the press is shorter than 500ms
 *   - onAnnotate is NOT called when neither onWordTap nor onAnnotate is provided
 */

import React from "react";
import { render, act } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";

const noop = () => {};

function dispatchPointerEvent(
  el: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  coords: { clientX: number; clientY: number } = { clientX: 0, clientY: 0 },
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clientX", { value: coords.clientX });
  Object.defineProperty(event, "clientY", { value: coords.clientY });
  el.dispatchEvent(event);
}

describe("SentenceReader — onAnnotate regression #1735", () => {
  afterEach(() => jest.useRealTimers());

  it("calls onAnnotate with sentence text after 500ms long-press when onWordTap is not provided", () => {
    jest.useFakeTimers();
    const onAnnotate = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Here is a sentence for annotation."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        onAnnotate={onAnnotate}
        chapterIndex={2}
      />
    );

    const segs = Array.from(container.querySelectorAll("[data-seg]")) as HTMLElement[];
    expect(segs.length).toBeGreaterThan(0);

    dispatchPointerEvent(segs[0], "pointerdown", { clientX: 10, clientY: 10 });
    expect(onAnnotate).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(500); });
    expect(onAnnotate).toHaveBeenCalledTimes(1);
    expect(onAnnotate).toHaveBeenCalledWith(
      "Here is a sentence for annotation.",
      2,
    );
  });

  it("does not call onAnnotate when press is released before 500ms", () => {
    jest.useFakeTimers();
    const onAnnotate = jest.fn();
    const { container } = render(
      <SentenceReader
        text="Short press should not annotate."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        onAnnotate={onAnnotate}
        chapterIndex={0}
      />
    );

    const segs = Array.from(container.querySelectorAll("[data-seg]")) as HTMLElement[];
    dispatchPointerEvent(segs[0], "pointerdown", { clientX: 10, clientY: 10 });
    act(() => { jest.advanceTimersByTime(200); });
    dispatchPointerEvent(segs[0], "pointerup", { clientX: 10, clientY: 10 });
    act(() => { jest.advanceTimersByTime(400); });

    expect(onAnnotate).not.toHaveBeenCalled();
  });

  it("does not call onAnnotate when neither onAnnotate nor onWordTap is provided (segment has no pointer handler)", () => {
    jest.useFakeTimers();
    const { container } = render(
      <SentenceReader
        text="No handler sentence."
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );

    const segs = Array.from(container.querySelectorAll("[data-seg]")) as HTMLElement[];
    dispatchPointerEvent(segs[0], "pointerdown", { clientX: 10, clientY: 10 });
    act(() => { jest.advanceTimersByTime(600); });
    // Just verifies no crash
    expect(segs.length).toBeGreaterThan(0);
  });
});

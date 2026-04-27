/**
 * Regression #1736: TTS auto-scroll calls scrollIntoView on the body instead
 * of scrolling only #reader-scroll, causing the whole page to scroll upward.
 *
 * Fix: when #reader-scroll exists, use container.scrollTo() directly.
 * scrollIntoView() is only used as a fallback when the container is absent.
 */

import React from "react";
import { render, act } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";

const noop = () => {};

describe("SentenceReader — TTS auto-scroll uses #reader-scroll container (#1736)", () => {
  let scrollTo: jest.Mock;
  let readerEl: HTMLDivElement;

  beforeEach(() => {
    scrollTo = jest.fn();
    readerEl = document.createElement("div");
    readerEl.id = "reader-scroll";
    // Mock getBoundingClientRect on the container
    readerEl.getBoundingClientRect = jest.fn().mockReturnValue({
      top: 0, bottom: 500, height: 500, left: 0, right: 800, width: 800,
      x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(readerEl, "scrollTop", { writable: true, value: 0 });
    readerEl.scrollTo = scrollTo;
    document.body.appendChild(readerEl);
  });

  afterEach(() => {
    readerEl.remove();
    jest.restoreAllMocks();
  });

  it("calls container.scrollTo (not scrollIntoView) when active segment is out of view", () => {
    const scrollIntoViewMock = jest.fn();

    // Render with no audio initially
    const { rerender } = render(
      <SentenceReader
        text="First sentence here. Second sentence here."
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );

    // Mock scrollIntoView on all elements
    document.querySelectorAll("[data-seg]").forEach((el) => {
      (el as HTMLElement).scrollIntoView = scrollIntoViewMock;
      // Make the element appear out of view (below the container)
      (el as HTMLElement).getBoundingClientRect = jest.fn().mockReturnValue({
        top: 600, bottom: 620, height: 20, left: 0, right: 200, width: 200,
        x: 0, y: 600, toJSON: () => ({}),
      } as DOMRect);
    });

    // Start playing — active segment should scroll into view
    act(() => {
      rerender(
        <SentenceReader
          text="First sentence here. Second sentence here."
          duration={10}
          currentTime={0.1}
          isPlaying={true}
          onSegmentClick={noop}
        />
      );
    });

    // container.scrollTo should be called, not scrollIntoView
    expect(scrollTo).toHaveBeenCalled();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("does NOT call container.scrollTo when active segment is already in view", () => {
    const { rerender } = render(
      <SentenceReader
        text="Visible sentence in view."
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );

    // Make element appear within the container bounds (relTop=100, relBottom=120, containerHeight=500)
    document.querySelectorAll("[data-seg]").forEach((el) => {
      (el as HTMLElement).getBoundingClientRect = jest.fn().mockReturnValue({
        top: 100, bottom: 120, height: 20, left: 0, right: 200, width: 200,
        x: 0, y: 100, toJSON: () => ({}),
      } as DOMRect);
    });

    act(() => {
      rerender(
        <SentenceReader
          text="Visible sentence in view."
          duration={10}
          currentTime={0.1}
          isPlaying={true}
          onSegmentClick={noop}
        />
      );
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

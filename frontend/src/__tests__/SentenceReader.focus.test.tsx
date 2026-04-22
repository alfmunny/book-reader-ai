import React from "react";
import { render, screen } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";

const TEXT = "First paragraph text here.\n\nSecond paragraph text here.\n\nThird paragraph text here.";
const noop = () => {};

describe("SentenceReader — paragraph focus", () => {
  it("applies para-dim to non-focused paragraphs and para-active to focused", () => {
    render(
      <SentenceReader
        text={TEXT}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        focusParagraphIdx={1}
      />
    );

    const paras = document.querySelectorAll("[data-para-idx]");
    expect(paras).toHaveLength(3);
    expect(paras[0]).toHaveClass("para-dim");
    expect(paras[1]).toHaveClass("para-active");
    expect(paras[2]).toHaveClass("para-dim");
  });

  it("applies no focus classes when focusParagraphIdx is undefined", () => {
    render(
      <SentenceReader
        text={TEXT}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );

    const paras = document.querySelectorAll("[data-para-idx]");
    paras.forEach((p) => {
      expect(p).not.toHaveClass("para-dim");
      expect(p).not.toHaveClass("para-active");
    });
  });

  it("focuses paragraph 0 correctly", () => {
    render(
      <SentenceReader
        text={TEXT}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        focusParagraphIdx={0}
      />
    );

    const paras = document.querySelectorAll("[data-para-idx]");
    expect(paras[0]).toHaveClass("para-active");
    expect(paras[1]).toHaveClass("para-dim");
    expect(paras[2]).toHaveClass("para-dim");
  });

  it("fires onParagraphTimingsUpdate on mount", () => {
    const onTimings = jest.fn();
    render(
      <SentenceReader
        text={TEXT}
        duration={10}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
        onParagraphTimingsUpdate={onTimings}
      />
    );

    expect(onTimings).toHaveBeenCalledTimes(1);
    const timings = onTimings.mock.calls[0][0];
    expect(timings).toHaveLength(3);
    expect(timings[0]).toHaveProperty("startTime");
    expect(timings[0]).toHaveProperty("stopTime");
    // First para starts at 0, stop = second para start
    expect(timings[0].startTime).toBe(0);
    expect(timings[1].startTime).toBeGreaterThan(0);
  });

  it("fires onActiveParagraphChange when currentIdx crosses paragraph boundary", () => {
    const onActiveChange = jest.fn();
    // duration=10, 3 equal paragraphs → each ~3.33s
    // Para 0: 0-3.33, Para 1: 3.33-6.67, Para 2: 6.67-10
    const { rerender } = render(
      <SentenceReader
        text={TEXT}
        duration={10}
        currentTime={0}
        isPlaying={true}
        onSegmentClick={noop}
        onActiveParagraphChange={onActiveChange}
      />
    );

    // Advance into second paragraph (>3.33s)
    rerender(
      <SentenceReader
        text={TEXT}
        duration={10}
        currentTime={5}
        isPlaying={true}
        onSegmentClick={noop}
        onActiveParagraphChange={onActiveChange}
      />
    );

    // Should have been called with paragraph 1
    expect(onActiveChange).toHaveBeenCalledWith(1);
  });

  it("adds data-para-idx to each paragraph div", () => {
    render(
      <SentenceReader
        text={TEXT}
        duration={0}
        currentTime={0}
        isPlaying={false}
        onSegmentClick={noop}
      />
    );

    expect(document.querySelector("[data-para-idx='0']")).toBeInTheDocument();
    expect(document.querySelector("[data-para-idx='1']")).toBeInTheDocument();
    expect(document.querySelector("[data-para-idx='2']")).toBeInTheDocument();
  });
});

/**
 * Story markers + share action in the reader (phase 2, #2752): the muted
 * per-paragraph count marker and the Share button on session paragraphs.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";

const noop = () => {};
const TEXT = "Die Sonne tönt, nach alter Weise.\n\nEs schäumt das Meer in breiten Flüssen.";

function renderReader(overrides: Partial<React.ComponentProps<typeof SentenceReader>> = {}) {
  const props: React.ComponentProps<typeof SentenceReader> = {
    text: TEXT,
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    onSegmentClick: noop,
    translations: ["太阳依着古老的方式轰鸣。", "大海在翻腾。"],
    translationDisplayMode: "parallel",
    translationLang: "zh",
    ...overrides,
  };
  return { ...render(<SentenceReader {...props} />), props };
}

test("story marker shows the count and opens the panel", () => {
  const onOpenStories = jest.fn();
  renderReader({ storyCounts: { 0: 2 }, onOpenStories });
  const marker = screen.getByTestId("story-marker-0");
  expect(marker).toHaveTextContent("2");
  expect(marker).toHaveAccessibleName("2 shares on paragraph 1");
  fireEvent.click(marker);
  expect(onOpenStories).toHaveBeenCalledWith(0);
});

test("no marker without a count for that paragraph", () => {
  renderReader({ storyCounts: { 0: 1 }, onOpenStories: jest.fn() });
  expect(screen.queryByTestId("story-marker-1")).toBeNull();
});

test("Share appears in the session action row and reports the paragraph", () => {
  const onShareParagraph = jest.fn();
  renderReader({
    sessionMode: true,
    translationMeta: { 0: { model: "deepseek-v4-flash", edited: false } },
    onShareParagraph,
  });
  fireEvent.click(screen.getByRole("button", { name: "Share translation of paragraph 1" }));
  expect(onShareParagraph).toHaveBeenCalledWith(0);
});

test("without storyCounts nothing story-related renders", () => {
  renderReader();
  expect(screen.queryByTestId("story-marker-0")).toBeNull();
});

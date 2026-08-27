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

// ── Sentence-anchored shared notes (WeRead pattern, owner 2026-08-27) ──────
// No count dot (owner 2026-08-28): the dashed sentence IS the tap target.

test("shared-note sentence gets the dashed underline and opens notes on click", () => {
  const onSharedNotesClick = jest.fn();
  renderReader({
    sharedNotes: [{ sentenceText: "Die Sonne tönt, nach alter Weise.", count: 1 }],
    onSharedNotesClick,
  });
  const seg = document.querySelector('[data-seg="0"]') as HTMLElement;
  expect(seg.className).toContain("decoration-dashed");
  expect(seg.className).not.toContain("decoration-dotted");
  expect(seg).toHaveAttribute("role", "button");
  expect(seg.getAttribute("aria-label")).toContain("Shared notes on:");
  fireEvent.click(seg);
  expect(onSharedNotesClick).toHaveBeenCalledWith(
    "Die Sonne tönt, nach alter Weise.",
    expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
  );
});

test("a fragment anchor still marks its containing sentence", () => {
  renderReader({
    sharedNotes: [{ sentenceText: "nach alter Weise", count: 2 }],
    onSharedNotesClick: jest.fn(),
  });
  const seg = document.querySelector('[data-seg="0"]') as HTMLElement;
  expect(seg.className).toContain("decoration-dashed");
});

test("sentences without shared notes stay undecorated and inert", () => {
  renderReader({
    sharedNotes: [{ sentenceText: "Die Sonne tönt, nach alter Weise.", count: 1 }],
    onSharedNotesClick: jest.fn(),
  });
  const seg1 = document.querySelector('[data-seg="1"]') as HTMLElement;
  expect(seg1.className).not.toContain("decoration-dashed");
  expect(seg1).not.toHaveAttribute("role");
});

test("repeated identical sentences: only the first occurrence carries the note", () => {
  render(
    <SentenceReader
      text={"Die Sonne tönt.\n\nDie Sonne tönt."}
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={noop}
      sharedNotes={[{ sentenceText: "Die Sonne tönt.", count: 1 }]}
      onSharedNotesClick={jest.fn()}
    />,
  );
  const seg0 = document.querySelector('[data-seg="0"]') as HTMLElement;
  const seg1 = document.querySelector('[data-seg="1"]') as HTMLElement;
  expect(seg0.className).toContain("decoration-dashed");
  expect(seg1.className).not.toContain("decoration-dashed");
});

test("a multi-sentence anchor underlines its whole contiguous section", () => {
  render(
    <SentenceReader
      text={"Erster Satz hier. Zweiter Satz folgt. Dritter Satz endet.\n\nAnderer Absatz."}
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={noop}
      sharedNotes={[{ sentenceText: "Erster Satz hier. Zweiter Satz folgt.", count: 1 }]}
      onSharedNotesClick={jest.fn()}
    />,
  );
  const seg = (n: number) => document.querySelector(`[data-seg="${n}"]`) as HTMLElement;
  expect(seg(0).className).toContain("decoration-dashed");
  expect(seg(1).className).toContain("decoration-dashed");
  expect(seg(2).className).not.toContain("decoration-dashed"); // outside the anchor
  expect(seg(3).className).not.toContain("decoration-dashed"); // next paragraph
});

test("a sentence with BOTH own annotation and shared notes opens the notes panel", () => {
  const onSharedNotesClick = jest.fn();
  const onAnnotationClick = jest.fn();
  renderReader({
    sharedNotes: [{ sentenceText: "Die Sonne tönt, nach alter Weise.", count: 1 }],
    onSharedNotesClick,
    onAnnotationClick,
    chapterIndex: 0,
    annotations: [{
      id: 7, book_id: 1, chapter_index: 0,
      sentence_text: "Die Sonne tönt, nach alter Weise.",
      note_text: "mine", color: "yellow",
    } as never],
  });
  const seg = document.querySelector('[data-seg="0"]') as HTMLElement;
  fireEvent.click(seg);
  expect(onSharedNotesClick).toHaveBeenCalled();
  expect(onAnnotationClick).not.toHaveBeenCalled();
});

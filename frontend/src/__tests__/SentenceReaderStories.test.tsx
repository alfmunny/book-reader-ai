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

test("no margin marker renders for translation posts (browsing lives in Share)", () => {
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

test("translations carry their paragraph tag; only posted ones get the dashed marker", () => {
  // Selection — not clicking — opens the dialog now (owner, 2026-08-30):
  // the tag is what the selection toolbar reads.
  renderReader({ postParagraphs: new Set([0]) });
  const dashed = screen.getByTestId("post-underline-0");
  expect(dashed.className).toContain("decoration-dashed");
  // The marker is an INLINE span so the hit area hugs the words; the
  // paragraph tag stays on its <p> ancestor for the selection toolbar
  expect(dashed.tagName).toBe("SPAN");
  expect(dashed.closest("[data-translation-para]")).toHaveAttribute("data-translation-para", "0");
  const plain = screen.getByTestId("post-underline-1");
  expect(plain.className).not.toContain("decoration-dashed");
  expect(plain.closest("[data-translation-para]")).toHaveAttribute("data-translation-para", "1");
  // Nothing clickable without notes or posts
  expect(dashed).not.toHaveAttribute("role");
});

// ── Consolidated markers (owner, 2026-08-30) ──────────────────────────────

test("underline style encodes what exists: notes, translations, or both", () => {
  const onOpenPosts = jest.fn();
  render(
    <SentenceReader
      text={"Erster Absatz.\n\nZweiter Absatz.\n\nDritter Absatz.\n\nVierter Absatz."}
      duration={0} currentTime={0} isPlaying={false} onSegmentClick={noop}
      translations={["译一", "译二", "译三", "译四"]}
      translationDisplayMode="parallel"
      notedParagraphs={new Set([0, 2])}
      postParagraphs={new Set([1, 2])}
      onOpenPosts={onOpenPosts}
    />,
  );
  const cls = (n: number) => (screen.getByTestId(`post-underline-${n}`) as HTMLElement).className;
  expect(cls(0)).toContain("decoration-solid");   // notes only
  expect(cls(1)).toContain("decoration-dashed");  // other translations only
  expect(cls(2)).toContain("decoration-double");  // both
  expect(cls(3)).not.toContain("underline");      // nothing to show
});

test("clicking a marked translation opens the matching tab", () => {
  const onOpenPosts = jest.fn();
  render(
    <SentenceReader
      text={"Erster Absatz.\n\nZweiter Absatz."}
      duration={0} currentTime={0} isPlaying={false} onSegmentClick={noop}
      translations={["译一", "译二"]}
      translationDisplayMode="parallel"
      notedParagraphs={new Set([0])}
      postParagraphs={new Set([1])}
      onOpenPosts={onOpenPosts}
    />,
  );
  fireEvent.click(screen.getByTestId("post-underline-0"));
  expect(onOpenPosts).toHaveBeenLastCalledWith(0, expect.anything(), "notes");
  fireEvent.click(screen.getByTestId("post-underline-1"));
  expect(onOpenPosts).toHaveBeenLastCalledWith(1, expect.anything(), "translations");
});

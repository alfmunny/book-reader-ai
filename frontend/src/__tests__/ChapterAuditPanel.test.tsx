/**
 * The chapter audit panel: find the damage, fix it in place, keep track.
 *
 * The two operations that matter are split and merge — the previous editor had
 * neither, and a merged pair of chapters is the most common split failure.
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ChapterAuditPanel, { AuditChapter } from "@/components/ChapterAuditPanel";

const para = (n: number) => `Paragraph ${n} ${"x".repeat(220)}`;
const chapter = (title: string, paras = 3, reviewed = false): AuditChapter => ({
  title,
  text: Array.from({ length: paras }, (_, i) => para(i)).join("\n\n"),
  reviewed,
});

function setup(chapters: AuditChapter[] = [chapter("Nacht"), chapter("Vor dem Tor")]) {
  const onSaveMeta = jest.fn().mockResolvedValue({ ok: true });
  const onSaveStructure = jest.fn().mockResolvedValue({ ok: true });
  const onFinish = jest.fn().mockResolvedValue({ ok: true });
  render(
    <ChapterAuditPanel
      chapters={chapters}
      onSaveMeta={onSaveMeta}
      onSaveStructure={onSaveStructure}
      onFinish={onFinish}
    />,
  );
  return { onSaveMeta, onSaveStructure, onFinish };
}

beforeEach(() => jest.clearAllMocks());

// ── orientation ──────────────────────────────────────────────────────────────

it("leads with what needs attention and how far in you are", () => {
  setup([chapter("Nacht"), { title: "", text: "runt", reviewed: false }]);
  expect(screen.getByText(/flagged/)).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: /review progress/i })).toHaveAttribute("aria-valuemax", "2");
});

it("marks an untitled chapter in the rail rather than showing a blank row", () => {
  setup([{ title: "", text: para(0), reviewed: false }]);
  expect(screen.getByText("untitled")).toBeInTheDocument();
});

it("explains why the open chapter is flagged", () => {
  setup([{ title: "", text: "too short", reviewed: false }]);
  expect(screen.getByText(/stray heading/i)).toBeInTheDocument();
});

it("names flags in the rail button so screen readers get them too", () => {
  setup([{ title: "", text: "too short", reviewed: false }]);
  expect(screen.getByRole("button", { name: /untitled.*flag/i })).toBeInTheDocument();
});

// ── the split gesture ────────────────────────────────────────────────────────

it("offers a split between paragraphs but not before the first", () => {
  setup([chapter("Nacht", 3)]);
  expect(screen.getAllByRole("button", { name: /split into a new chapter/i })).toHaveLength(2);
});

it("splits a chapter in two and saves the structure", async () => {
  const user = userEvent.setup();
  const { onSaveStructure } = setup([chapter("Nacht", 3)]);

  await user.click(screen.getAllByRole("button", { name: /split into a new chapter/i })[0]);

  await waitFor(() => expect(onSaveStructure).toHaveBeenCalled());
  const saved = onSaveStructure.mock.calls[0][0] as AuditChapter[];
  expect(saved).toHaveLength(2);
  expect(saved[0].text).toBe(para(0));
  expect(saved[1].text).toBe([para(1), para(2)].join("\n\n"));
});

it("a split chapter starts untitled and unreviewed — it is new and unchecked", async () => {
  const user = userEvent.setup();
  const { onSaveStructure } = setup([chapter("Nacht", 3, true)]);

  await user.click(screen.getAllByRole("button", { name: /split into a new chapter/i })[0]);

  const saved = onSaveStructure.mock.calls[0][0] as AuditChapter[];
  expect(saved[1].title).toBe("");
  expect(saved.every((c) => c.reviewed === false)).toBe(true);
});

// ── merge and discard ────────────────────────────────────────────────────────

it("cannot merge the first chapter into anything", () => {
  setup();
  expect(screen.getByRole("button", { name: /merge into previous/i })).toBeDisabled();
});

it("merges a chapter into the one before it", async () => {
  const user = userEvent.setup();
  const { onSaveStructure } = setup([chapter("A", 1), chapter("B", 1)]);

  await user.click(screen.getByRole("button", { name: /Chapter 2/i }));
  await user.click(screen.getByRole("button", { name: /merge into previous/i }));

  const saved = onSaveStructure.mock.calls[0][0] as AuditChapter[];
  expect(saved).toHaveLength(1);
  expect(saved[0].text).toContain(para(0));
});

it("refuses to discard the last remaining chapter", () => {
  setup([chapter("Only")]);
  expect(screen.getByRole("button", { name: /discard/i })).toBeDisabled();
});

it("discards a chapter", async () => {
  const user = userEvent.setup();
  const { onSaveStructure } = setup([chapter("A"), chapter("B")]);

  await user.click(screen.getByRole("button", { name: /discard/i }));

  expect((onSaveStructure.mock.calls[0][0] as AuditChapter[])).toHaveLength(1);
});

// ── review ticks ─────────────────────────────────────────────────────────────

it("marking reviewed advances to the next chapter — the audit is a queue", async () => {
  const user = userEvent.setup();
  setup([chapter("A"), chapter("B")]);

  await user.click(screen.getByRole("button", { name: /mark reviewed/i }));

  expect(screen.getByRole("button", { name: /Chapter 2/i })).toHaveAttribute("aria-current", "true");
});

it("does not run off the end on the last chapter", async () => {
  const user = userEvent.setup();
  setup([chapter("Only")]);
  await user.click(screen.getByRole("button", { name: /mark reviewed/i }));
  // The rail label also contains "reviewed" — target the footer control exactly.
  expect(screen.getByRole("button", { name: /^Reviewed$/ })).toBeInTheDocument();
});

// ── autosave ─────────────────────────────────────────────────────────────────

it("debounces title edits instead of saving every keystroke", async () => {
  jest.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const { onSaveMeta } = setup([chapter("A")]);

  await user.type(screen.getByLabelText("Title"), "bcd");
  expect(onSaveMeta).not.toHaveBeenCalled();

  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(onSaveMeta).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

it("tells you when a save failed, because the change is only local then", async () => {
  jest.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const onSaveMeta = jest.fn().mockRejectedValue(new Error("offline"));
  render(
    <ChapterAuditPanel
      chapters={[chapter("A")]}
      onSaveMeta={onSaveMeta}
      onSaveStructure={jest.fn().mockResolvedValue({})}
      onFinish={jest.fn()}
    />,
  );

  await user.type(screen.getByLabelText("Title"), "z");
  await act(async () => { jest.advanceTimersByTime(1000); });

  expect(screen.getByText(/only on this device/i)).toBeInTheDocument();
  jest.useRealTimers();
});

// ── title tools ──────────────────────────────────────────────────────────────

it("numbers every chapter, keeping the names", async () => {
  const user = userEvent.setup();
  const { onSaveMeta } = setup([chapter("Zueignung"), chapter("Nacht")]);

  await user.click(screen.getByRole("button", { name: /number them/i }));

  const saved = onSaveMeta.mock.calls[0][0] as AuditChapter[];
  expect(saved.map((c) => c.title)).toEqual(["1. Zueignung", "2. Nacht"]);
});

it("undoes a title tool in one step", async () => {
  const user = userEvent.setup();
  setup([chapter("Zueignung")]);

  await user.click(screen.getByRole("button", { name: /number them/i }));
  expect(screen.getByLabelText("Title")).toHaveValue("1. Zueignung");

  await user.click(screen.getByRole("button", { name: /undo/i }));
  expect(screen.getByLabelText("Title")).toHaveValue("Zueignung");
});

it("undo is unavailable until something has been done", () => {
  setup();
  expect(screen.getByRole("button", { name: /undo/i })).toBeDisabled();
});

// ── finishing ────────────────────────────────────────────────────────────────

it("will not finish while chapters are unreviewed, and says how many are left", () => {
  setup([chapter("A", 3, true), chapter("B")]);
  expect(screen.getByRole("button", { name: /add to shelf/i })).toBeDisabled();
  expect(screen.getByText(/1 chapter still to review/i)).toBeInTheDocument();
});

it("finishes once every chapter is reviewed", async () => {
  const user = userEvent.setup();
  const { onFinish } = setup([chapter("A", 3, true)]);

  const finish = screen.getByRole("button", { name: /add to shelf/i });
  expect(finish).toBeEnabled();
  await user.click(finish);

  expect(onFinish).toHaveBeenCalled();
});

it("says what finishing actually does", () => {
  setup([chapter("A", 3, true)]);
  expect(screen.getByText(/your notes stay put/i)).toBeInTheDocument();
});

it("handles a book with no chapters without crashing", () => {
  setup([]);
  expect(screen.getByText(/no chapters to review/i)).toBeInTheDocument();
});

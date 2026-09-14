/**
 * Bulk review (owner, 2026-08-31): when the split is visibly right, forty
 * individual ticks verify nothing. Flagged chapters are not swept up — a flag
 * is the panel saying "look at this one".
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ChapterAuditPanel from "@/components/ChapterAuditPanel";

// comfortably past RUNT_CHARS (400), so only the deliberate runt is flagged
const body = (n: number) => Array.from({ length: 8 }, (_, i) =>
  `Paragraph ${i} of chapter ${n}. It has a sensible length for prose, running long enough that nobody mistakes the chapter for a stray heading.`,
).join("\n\n");

test("mark-the-rest ticks every clean chapter and leaves flagged ones alone", async () => {
  const onSaveMeta = jest.fn().mockResolvedValue({ ok: true });
  const chapters = [
    { title: "One", text: body(1), reviewed: true },
    { title: "Two", text: body(2), reviewed: false },
    { title: "Runt", text: "tiny", reviewed: false },  // flagged: runt
    { title: "Four", text: body(4), reviewed: false },
  ];
  render(
    <ChapterAuditPanel
      chapters={chapters}
      onSaveMeta={onSaveMeta}
      onSaveStructure={jest.fn()}
      onFinish={jest.fn()}
    />,
  );

  fireEvent.click(screen.getByTestId("mark-rest-reviewed"));
  // 3 of 4 reviewed — the runt stays unreviewed and the button stays offered
  const progress = screen.getByRole("progressbar", { name: "Review progress" });
  await waitFor(() => expect(progress).toHaveAttribute("aria-valuenow", "3"));
  expect(screen.getByTestId("mark-rest-reviewed")).toBeInTheDocument();
  // the tick is persisted through the same debounced meta save as manual ones
  await waitFor(() => {
    const calls = onSaveMeta.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const saved = calls.at(-1)![0];
    expect(saved.map((c: { reviewed: boolean }) => c.reviewed)).toEqual([true, true, false, true]);
  }, { timeout: 3000 });
});

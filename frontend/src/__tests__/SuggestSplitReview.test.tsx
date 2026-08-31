/**
 * #2789 follow-up: book_parser only recognises Latin-script headings, so a
 * book that marks its chapters otherwise (第一章, глава) arrives as one
 * chapter. The reader can ask for a split — advisory, reviewed before it lands.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

jest.mock("next/navigation", () => ({
  useParams: () => ({ bookId: "7" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("@/lib/api");

import * as api from "@/lib/api";
import Page from "@/app/(shell)/upload/[bookId]/chapters/page";

const DRAFT = [
  { chapter_index: 0, title: "全文", text: "第一章\n\n本文。\n\n第二章\n\n続き。", reviewed: false },
];

beforeEach(() => {
  jest.clearAllMocks();
  (api.getBookMeta as jest.Mock).mockResolvedValue({ id: 7, title: "My Test Novel" });
  (api.getDraftChapters as jest.Mock).mockResolvedValue({ chapters: DRAFT });
  (api.getFrozenSplit as jest.Mock).mockRejectedValue(new Error("no frozen split"));
  (api.saveDraftChapterStructure as jest.Mock).mockResolvedValue({ ok: true, chapter_count: 2 });
});

test("a proposal changes nothing until the reader accepts it", async () => {
  (api.suggestChapterSplit as jest.Mock).mockResolvedValue({
    chapters: [
      { title: "第一章", text: "本文。" },
      { title: "第二章", text: "続き。" },
    ],
    rule: { heading_pattern: "第[一二三]章", require_unindented: true },
    notes: "A chapter heading is 第N章 alone on its line.",
  });
  render(<Page />);

  fireEvent.click(await screen.findByTestId("suggest-split-btn"));
  const panel = await screen.findByTestId("split-proposal");
  expect(panel).toHaveTextContent("第一章");
  expect(panel).toHaveTextContent("2 chapters proposed");
  // The rule is the thing worth judging — the reader sees it, not just output
  expect(panel).toHaveTextContent("A chapter heading is 第N章 alone on its line.");
  expect(screen.getByTestId("split-rule")).toHaveTextContent("第[一二三]章");
  // the draft is untouched while the proposal is only being looked at
  expect(api.saveDraftChapterStructure).not.toHaveBeenCalled();

  fireEvent.click(screen.getByTestId("apply-split-btn"));
  await waitFor(() =>
    expect(api.saveDraftChapterStructure).toHaveBeenCalledWith(7, [
      { title: "第一章", text: "本文。", reviewed: false },
      { title: "第二章", text: "続き。", reviewed: false },
    ]),
  );
});

test("discarding a proposal leaves the draft alone", async () => {
  (api.suggestChapterSplit as jest.Mock).mockResolvedValue({
    chapters: [{ title: "第一章", text: "本文。" }],
  });
  render(<Page />);

  fireEvent.click(await screen.findByTestId("suggest-split-btn"));
  await screen.findByTestId("split-proposal");
  // "Discard" already means discarding the whole upload on this page
  fireEvent.click(screen.getByTestId("dismiss-split-btn"));

  await waitFor(() => expect(screen.queryByTestId("split-proposal")).toBeNull());
  expect(api.saveDraftChapterStructure).not.toHaveBeenCalled();
});

test("when nothing can be proposed the reason is shown", async () => {
  (api.suggestChapterSplit as jest.Mock).mockRejectedValue(
    new Error("No chapter structure could be identified."),
  );
  render(<Page />);

  fireEvent.click(await screen.findByTestId("suggest-split-btn"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No chapter structure could be identified.",
  );
  expect(api.saveDraftChapterStructure).not.toHaveBeenCalled();
});

test("the book's own title can be corrected from the review page", async () => {
  (api.getBookMeta as jest.Mock).mockResolvedValue({ id: 7, title: "My Test Novel" });
  (api.updateBookMeta as jest.Mock).mockResolvedValue({ ok: true, title: "不夜城", authors: [] });
  render(<Page />);

  fireEvent.click(await screen.findByTestId("edit-book-title"));
  const input = screen.getByLabelText("Book title") as HTMLInputElement;
  expect(input.value).toBe("My Test Novel");
  fireEvent.change(input, { target: { value: "不夜城" } });
  fireEvent.click(screen.getByTestId("save-book-title"));

  await waitFor(() => expect(api.updateBookMeta).toHaveBeenCalledWith(7, { title: "不夜城" }));
  expect(await screen.findByTestId("edit-book-title")).toHaveTextContent("不夜城");
});

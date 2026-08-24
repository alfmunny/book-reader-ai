/**
 * Regression (owner report, 2026-08-24): a chat answer showed "Saved" while
 * the insight never reached the server — the save button wrote its "saved"
 * flag to localStorage BEFORE calling the save API, so a failed save (expired
 * session, validation error) left a permanent phantom "Saved" label that also
 * blocked ever retrying the save.
 *
 * Truthful save: (1) the "Saved" state derives from the insights actually on
 * the server, and (2) the button only flips to "Saved" after the save call
 * resolves.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import InsightChat from "@/components/InsightChat";

jest.mock("@/lib/api", () => ({
  getInsight: jest.fn().mockResolvedValue({ insight: "Mocked insight", provider: "gemini" }),
  askQuestion: jest.fn().mockResolvedValue({ answer: "Mocked answer", provider: "gemini" }),
  getChatMessages: jest.fn(),
  postChatMessage: jest.fn().mockResolvedValue({ id: 1, role: "assistant", content: "", created_at: "" }),
  getInsights: jest.fn().mockResolvedValue([]),
}));

const QUESTION = "What is the wager between God and Mephistopheles?";
const ANSWER = "A bet over whether Faust can be led astray from his striving.";
const SAVE_KEY = `saved-insights:1:2229`;
const savedKeyFor = (q: string, a: string) => `${q.slice(0, 60)}|${a.slice(0, 60)}`;

const defaultProps = {
  bookId: "2229",
  userId: 1,
  hasGeminiKey: true,
  isVisible: true,
  chapterText: "Prolog im Himmel.",
  chapterTitle: "Prolog im Himmel",
  selectedText: "",
  bookTitle: "Faust",
  author: "Goethe",
  bookLanguage: "de",
};

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  const { getChatMessages, getInsights } = jest.requireMock("@/lib/api");
  // Server returns newest-first; the component reverses to chronological.
  getChatMessages.mockResolvedValue({
    messages: [
      { id: 2, role: "assistant", content: ANSWER, created_at: "" },
      { id: 1, role: "user", content: QUESTION, created_at: "" },
    ],
    has_more: false,
  });
  getInsights.mockResolvedValue([]);
});

async function renderChat(onSaveInsight: (q: string, a: string, c?: string) => void | Promise<unknown>) {
  render(<InsightChat {...defaultProps} onSaveInsight={onSaveInsight} />);
  await act(async () => {});
  return screen.getByRole("button", { name: /save to notes|saved/i });
}

test("a failed save leaves the button as 'Save to notes' and stores no saved flag", async () => {
  const onSaveInsight = jest.fn(() => Promise.reject(new Error("session expired")));
  const btn = await renderChat(onSaveInsight);

  fireEvent.click(btn);
  await act(async () => {});

  expect(onSaveInsight).toHaveBeenCalledWith(QUESTION, ANSWER, undefined);
  expect(screen.getByRole("button", { name: "Save to notes" })).toBeInTheDocument();
  const stored = localStorage.getItem(SAVE_KEY);
  expect(stored ? JSON.parse(stored) : []).not.toContain(savedKeyFor(QUESTION, ANSWER));
});

test("a failed save can be retried", async () => {
  const onSaveInsight = jest
    .fn<void | Promise<unknown>, [string, string, string?]>()
    .mockReturnValueOnce(Promise.reject(new Error("boom")))
    .mockReturnValueOnce(Promise.resolve());
  const btn = await renderChat(onSaveInsight);

  fireEvent.click(btn);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Save to notes" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument());
  expect(onSaveInsight).toHaveBeenCalledTimes(2);
});

test("a successful save flips the button to Saved", async () => {
  const onSaveInsight = jest.fn(() => Promise.resolve());
  const btn = await renderChat(onSaveInsight);

  fireEvent.click(btn);
  await waitFor(() => expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument());
  const stored = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "[]");
  expect(stored).toContain(savedKeyFor(QUESTION, ANSWER));
});

test("a stale localStorage 'saved' flag is corrected by server truth", async () => {
  // The phantom: localStorage says saved, but the server has no such insight.
  localStorage.setItem(SAVE_KEY, JSON.stringify([savedKeyFor(QUESTION, ANSWER)]));
  const btn = await renderChat(jest.fn(() => Promise.resolve()));

  expect(btn).toHaveAccessibleName("Save to notes");
});

test("an insight already on the server shows as Saved without localStorage", async () => {
  const { getInsights } = jest.requireMock("@/lib/api");
  getInsights.mockResolvedValue([
    { id: 12, book_id: 2229, chapter_index: 2, question: QUESTION, answer: ANSWER, created_at: "" },
  ]);
  const btn = await renderChat(jest.fn(() => Promise.resolve()));

  expect(btn).toHaveAccessibleName("Saved");
});

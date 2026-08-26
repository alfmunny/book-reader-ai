/**
 * Translation session switcher (design: docs/design/user-translations.md, #2740).
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  createTranslationSession: jest.fn(),
  updateTranslationSession: jest.fn(),
  deleteTranslationSession: jest.fn(),
}));

import * as api from "@/lib/api";
import TranslationSessionPanel from "@/components/TranslationSessionPanel";
import type { TranslationSession } from "@/lib/api";

const SESSION: TranslationSession = {
  id: 5, book_id: 2229, name: "诗意版", target_language: "zh",
  style_prompt: "优雅的书面语", provider: "deepseek", status: "private", coverage: { "2": 10 },
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof TranslationSessionPanel>> = {}) {
  const props: React.ComponentProps<typeof TranslationSessionPanel> = {
    bookId: 2229,
    bookLanguage: "de",
    sessions: [SESSION],
    activeSessionId: null,
    chapterCount: 28,
    chapterIndex: 2,
    hasClaudeKey: true,
    hasDeepseekKey: true,
    onSelect: jest.fn(),
    onSessionsChanged: jest.fn(),
    onTranslateChapter: jest.fn(),
    translating: false,
    chapterProgress: null,
    ...overrides,
  };
  return { ...render(<TranslationSessionPanel {...props} />), props };
}

beforeEach(() => jest.clearAllMocks());

test("lists Editorial plus named sessions with language and provider chips", () => {
  renderPanel();
  expect(screen.getByRole("radio", { name: /Editorial/ })).toBeInTheDocument();
  const sessionRadio = screen.getByRole("radio", { name: /诗意版/ });
  expect(sessionRadio).toHaveTextContent("zh");
  expect(sessionRadio).toHaveTextContent("deepseek");
});

test("selecting a session and Editorial fires onSelect", () => {
  const { props } = renderPanel();
  fireEvent.click(screen.getByRole("radio", { name: /诗意版/ }));
  expect(props.onSelect).toHaveBeenCalledWith(SESSION);
  fireEvent.click(screen.getByRole("radio", { name: /Editorial/ }));
  expect(props.onSelect).toHaveBeenCalledWith(null);
});

test("creating a session posts and selects it", async () => {
  const created: TranslationSession = { ...SESSION, id: 9, name: "直译版", provider: "claude", coverage: {} };
  (api.createTranslationSession as jest.Mock).mockResolvedValue(created);
  const { props } = renderPanel();

  fireEvent.click(screen.getByText("＋ New session…"));
  fireEvent.change(screen.getByLabelText("Session name"), { target: { value: "直译版" } });
  fireEvent.change(screen.getByLabelText("Session provider"), { target: { value: "claude" } });
  fireEvent.click(screen.getByRole("button", { name: "Create session" }));

  await waitFor(() => expect(api.createTranslationSession).toHaveBeenCalledWith(
    expect.objectContaining({ book_id: 2229, name: "直译版", provider: "claude" }),
  ));
  expect(props.onSelect).toHaveBeenCalledWith(created);
  expect(props.onSessionsChanged).toHaveBeenCalledWith([SESSION, created]);
});

test("duplicate-name error from the API is shown", async () => {
  (api.createTranslationSession as jest.Mock).mockRejectedValue(new Error('You already have a session named "诗意版" for this book.'));
  renderPanel();
  fireEvent.click(screen.getByText("＋ New session…"));
  fireEvent.change(screen.getByLabelText("Session name"), { target: { value: "诗意版" } });
  fireEvent.click(screen.getByRole("button", { name: "Create session" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/already have a session/);
});

test("active session shows the style panel and translate-chapter button", () => {
  const { props } = renderPanel({ activeSessionId: 5, chapterProgress: { done: 3, total: 29 } });
  expect(screen.getByTestId("session-style-panel")).toBeInTheDocument();
  expect(screen.getByLabelText("Style & requirements")).toHaveValue("优雅的书面语");
  expect(screen.getByTestId("session-coverage")).toHaveTextContent("3 / 29 paragraphs");
  expect(screen.getByTestId("session-coverage")).toHaveTextContent("1 / 28 chapters started");
  fireEvent.click(screen.getByRole("button", { name: "Translate this chapter" }));
  expect(props.onTranslateChapter).toHaveBeenCalled();
});

test("deleting a session removes it and falls back to Editorial when active", async () => {
  (api.deleteTranslationSession as jest.Mock).mockResolvedValue({ ok: true });
  const { props } = renderPanel({ activeSessionId: 5 });
  fireEvent.click(screen.getByRole("button", { name: "Delete session 诗意版" }));
  await waitFor(() => expect(api.deleteTranslationSession).toHaveBeenCalledWith(5));
  expect(props.onSessionsChanged).toHaveBeenCalledWith([]);
  expect(props.onSelect).toHaveBeenCalledWith(null);
});

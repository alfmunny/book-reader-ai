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

  fireEvent.click(screen.getByText("＋ Add your own version"));
  fireEvent.change(screen.getByLabelText("Version name"), { target: { value: "直译版" } });
  fireEvent.change(screen.getAllByLabelText("Version provider")[0], { target: { value: "claude" } });
  fireEvent.click(screen.getByRole("button", { name: "Create version" }));

  await waitFor(() => expect(api.createTranslationSession).toHaveBeenCalledWith(
    expect.objectContaining({ book_id: 2229, name: "直译版", provider: "claude" }),
  ));
  expect(props.onSelect).toHaveBeenCalledWith(created);
  expect(props.onSessionsChanged).toHaveBeenCalledWith([SESSION, created]);
});

test("duplicate-name error from the API is shown", async () => {
  (api.createTranslationSession as jest.Mock).mockRejectedValue(new Error('You already have a session named "诗意版" for this book.'));
  renderPanel();
  fireEvent.click(screen.getByText("＋ Add your own version"));
  fireEvent.change(screen.getByLabelText("Version name"), { target: { value: "诗意版" } });
  fireEvent.click(screen.getByRole("button", { name: "Create version" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/already have a session/);
});

test("active session shows the style panel and translate-chapter button", () => {
  const { props } = renderPanel({ activeSessionId: 5, chapterProgress: { done: 3, total: 29 } });
  expect(screen.getByTestId("session-style-panel")).toBeInTheDocument();
  expect(screen.getByLabelText("Style & requirements")).toHaveValue("优雅的书面语");
  expect(screen.getByTestId("session-coverage")).toHaveTextContent("3 / 29 paragraphs");
  expect(screen.getByTestId("session-coverage")).toHaveTextContent("1 / 28 chapters started");
  // 3/29 done → the button offers the remaining fill run
  fireEvent.click(screen.getByRole("button", { name: "Translate remaining (26)" }));
  expect(props.onTranslateChapter).toHaveBeenCalledWith(false);
});

test("the language is changeable on an existing version", async () => {
  (api.updateTranslationSession as jest.Mock).mockResolvedValue({ ...SESSION, target_language: "en" });
  const { props } = renderPanel({ activeSessionId: 5 });
  fireEvent.change(screen.getByLabelText("Version target language"), { target: { value: "en" } });
  await waitFor(() => expect(api.updateTranslationSession).toHaveBeenCalledWith(5, { target_language: "en" }));
  // Reselected so the reader picks up the new language immediately
  expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ target_language: "en" }));
});

test("a complete chapter offers Retranslate behind a cost confirmation", () => {
  const { props } = renderPanel({
    activeSessionId: 5,
    chapterProgress: { done: 29, total: 29 },
    chapterChars: 8000,
  });
  const btn = screen.getByTestId("translate-chapter-button");
  expect(btn).toHaveTextContent("Retranslate this chapter");

  fireEvent.click(btn);
  // No run yet — the confirm dialog opens first
  expect(props.onTranslateChapter).not.toHaveBeenCalled();
  const dialog = screen.getByTestId("retranslate-confirm");
  expect(dialog).toHaveTextContent(/costs real tokens/);
  expect(dialog).toHaveTextContent(/deepseek-v4-flash/);
  expect(dialog).toHaveTextContent(/4,000 tokens/);

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(props.onTranslateChapter).not.toHaveBeenCalled();

  fireEvent.click(btn);
  fireEvent.click(screen.getByRole("button", { name: /^Retranslate \(/ }));
  expect(props.onTranslateChapter).toHaveBeenCalledWith(true);
});

test("a partially translated chapter offers 'Translate remaining' directly", () => {
  const { props } = renderPanel({
    activeSessionId: 5,
    chapterProgress: { done: 10, total: 29 },
  });
  const btn = screen.getByTestId("translate-chapter-button");
  expect(btn).toHaveTextContent("Translate remaining (19)");
  fireEvent.click(btn);
  expect(props.onTranslateChapter).toHaveBeenCalledWith(false);
  expect(screen.queryByTestId("retranslate-confirm")).toBeNull();
});

test("during a chapter run the button is a blocking progress bar", () => {
  const { props } = renderPanel({
    activeSessionId: 5,
    translating: true,
    runProgress: { done: 12, total: 29 },
  });
  const btn = screen.getByTestId("translate-chapter-button");
  expect(btn).toBeDisabled();
  expect(btn).toHaveTextContent("Translating 12 / 29…");
  const fill = screen.getByTestId("translate-progress-fill");
  expect(fill.style.width).toBe("41%");
  fireEvent.click(btn);
  expect(props.onTranslateChapter).not.toHaveBeenCalled();
});

test("a failed action shows a persistent, dismissible in-panel error", () => {
  const onDismissError = jest.fn();
  renderPanel({
    activeSessionId: 5,
    actionError: "Claude rejected your API key — check it in your profile.",
    onDismissError,
  });
  const alert = screen.getByTestId("session-action-error");
  expect(alert).toHaveTextContent(/rejected your API key/);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));
  expect(onDismissError).toHaveBeenCalled();
});

describe("version filter", () => {
  const MANY: TranslationSession[] = [
    SESSION, // 诗意版 zh deepseek
    { ...SESSION, id: 6, name: "直译学习版", provider: "claude" },
    { ...SESSION, id: 7, name: "English study", target_language: "en", provider: "claude" },
    { ...SESSION, id: 8, name: "Essai français", target_language: "fr", provider: "deepseek" },
  ];

  it("appears only when there are enough versions", () => {
    renderPanel({ sessions: [SESSION] });
    expect(screen.queryByTestId("version-filter")).toBeNull();
    renderPanel({ sessions: MANY });
    expect(screen.getByTestId("version-filter")).toBeInTheDocument();
  });

  it("filters by name", () => {
    renderPanel({ sessions: MANY });
    fireEvent.change(screen.getByLabelText("Filter versions by name"), { target: { value: "直译" } });
    expect(screen.getByRole("radio", { name: /直译学习版/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /诗意版/ })).toBeNull();
    expect(screen.getByRole("radio", { name: /Editorial/ })).toBeInTheDocument(); // always visible
  });

  it("filters by language and model", () => {
    renderPanel({ sessions: MANY });
    fireEvent.change(screen.getByLabelText("Filter versions by language"), { target: { value: "zh" } });
    expect(screen.queryByRole("radio", { name: /English study/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Filter versions by model"), { target: { value: "claude" } });
    expect(screen.getByRole("radio", { name: /直译学习版/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /诗意版/ })).toBeNull();
  });

  it("the active version stays visible even when filtered out", () => {
    renderPanel({ sessions: MANY, activeSessionId: 5 }); // 诗意版 active (deepseek)
    fireEvent.change(screen.getByLabelText("Filter versions by model"), { target: { value: "claude" } });
    expect(screen.getByRole("radio", { name: /诗意版/ })).toBeInTheDocument();
  });

  it("shows an explicit no-match note", () => {
    renderPanel({ sessions: MANY });
    fireEvent.change(screen.getByLabelText("Filter versions by name"), { target: { value: "zzzz" } });
    expect(screen.getByTestId("no-version-match")).toBeInTheDocument();
  });
});

test("deleting a session removes it and falls back to Editorial when active", async () => {
  (api.deleteTranslationSession as jest.Mock).mockResolvedValue({ ok: true });
  const { props } = renderPanel({ activeSessionId: 5 });
  fireEvent.click(screen.getByRole("button", { name: "Delete version 诗意版" }));
  await waitFor(() => expect(api.deleteTranslationSession).toHaveBeenCalledWith(5));
  expect(props.onSessionsChanged).toHaveBeenCalledWith([]);
  expect(props.onSelect).toHaveBeenCalledWith(null);
});

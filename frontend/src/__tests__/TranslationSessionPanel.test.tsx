/**
 * Translation session switcher (design: docs/design/user-translations.md, #2740).
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  createTranslationSession: jest.fn(),
  updateTranslationSession: jest.fn(),
  deleteTranslationSession: jest.fn(),
  publishTranslationSession: jest.fn(),
  unpublishTranslationSession: jest.fn(),
  getSessionCompleteness: jest.fn(),
  listVersionComments: jest.fn().mockResolvedValue({ comments: [] }),
  addVersionComment: jest.fn(),
  toggleReaction: jest.fn(),
  listReactions: jest.fn().mockResolvedValue({ reactions: {} }),
  listPublishedSessions: jest.fn().mockResolvedValue({ items: [], has_more: false }),
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
    onChangeLanguage: jest.fn(),
    translating: false,
    chapterProgress: null,
    ...overrides,
  };
  return { ...render(<TranslationSessionPanel {...props} />), props };
}

beforeEach(() => {
  jest.clearAllMocks();
  (api.listVersionComments as jest.Mock).mockResolvedValue({ comments: [] });
  (api.listReactions as jest.Mock).mockResolvedValue({ reactions: {} });
  (api.listPublishedSessions as jest.Mock).mockResolvedValue({ items: [], has_more: false });
});

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
    expect.objectContaining({ book_id: 2229, name: "直译版", provider: "claude", status: "public" }),
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

test("active session panel is lean: translate button + coverage, no inline fields", () => {
  const { props } = renderPanel({ activeSessionId: 5, chapterProgress: { done: 3, total: 29 } });
  expect(screen.getByTestId("session-style-panel")).toBeInTheDocument();
  // Per-version settings live in the Edit dialog now (owner, 2026-08-28)
  expect(screen.queryByLabelText("Version target language")).toBeNull();
  expect(screen.queryByLabelText("Style & requirements")).toBeNull();
  expect(screen.getByTestId("session-coverage")).toHaveTextContent("3 / 29 paragraphs");
  fireEvent.click(screen.getByRole("button", { name: "Translate remaining (26)" }));
  expect(props.onTranslateChapter).toHaveBeenCalledWith(false);
});
test("the row pencil opens the Edit dialog; saving updates all fields", async () => {
  (api.updateTranslationSession as jest.Mock).mockResolvedValue({ ...SESSION, target_language: "en", status: "public" });
  const { props } = renderPanel({ activeSessionId: 5 });
  fireEvent.click(screen.getByRole("button", { name: "Edit version 诗意版" }));
  const dialog = screen.getByRole("dialog", { name: "Edit translation version" });
  expect(dialog).toBeInTheDocument();
  expect((screen.getByLabelText("Version name") as HTMLInputElement).value).toBe("诗意版");
  fireEvent.change(screen.getByLabelText("Version target language"), { target: { value: "en" } });
  fireEvent.change(screen.getByLabelText("Version visibility"), { target: { value: "public" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(api.updateTranslationSession).toHaveBeenCalledWith(5, expect.objectContaining({
    name: "诗意版", target_language: "en", status: "public",
  })));
  // Active version reselected so the reader picks the changes up immediately
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

test("target language options carry editorial coverage numbers", () => {
  renderPanel({
    translationLang: "fr",
    editorialLanguages: { total: 28, languages: [{ code: "zh", chapters: 28 }] },
  });
  const select = screen.getByLabelText("Target language") as HTMLSelectElement;
  expect(select.value).toBe("fr");
  const texts = Array.from(select.options).map((o) => o.text);
  expect(texts).toContain("中文 — 28/28 ch");
  expect(texts).toContain("Français — 0/28 ch");
  // The book's own language is not offered
  expect(texts.some((t) => t.startsWith("Deutsch"))).toBe(false);
});

test("changing the target language fires onChangeLanguage", () => {
  const { props } = renderPanel({
    translationLang: "fr",
    editorialLanguages: { total: 28, languages: [] },
  });
  fireEvent.change(screen.getByLabelText("Target language"), { target: { value: "zh" } });
  expect(props.onChangeLanguage).toHaveBeenCalledWith("zh");
});

test("no editorial languages at all: options show 0/N and the empty-state note appears", () => {
  renderPanel({
    translationLang: "fr",
    editorialLanguages: { total: 28, languages: [] },
  });
  const select = screen.getByLabelText("Target language") as HTMLSelectElement;
  expect(Array.from(select.options).map((o) => o.text)).toContain("Français — 0/28 ch");
  expect(screen.getByText(/None yet — editorial translations are prepared offline/)).toBeInTheDocument();
});

test("the create dialog offers explicit visibility; public is sent through", async () => {
  const created = { ...SESSION, id: 11, name: "公开版", status: "public", coverage: {} };
  (api.createTranslationSession as jest.Mock).mockResolvedValue(created);
  renderPanel();
  fireEvent.click(screen.getByText("＋ Add your own version"));
  // It is a dialog now, not an inline field cluster
  expect(screen.getByRole("dialog", { name: "New translation version" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Version name"), { target: { value: "公开版" } });
  fireEvent.change(screen.getByLabelText("Version visibility"), { target: { value: "public" } });
  fireEvent.click(screen.getByRole("button", { name: "Create version" }));
  await waitFor(() => expect(api.createTranslationSession).toHaveBeenCalledWith(
    expect.objectContaining({ name: "公开版", status: "public" }),
  ));
});

// ── Track B: Community group + publication (#2752) ────────────────────────

const PUBLISHED = {
  id: 77, book_id: 2229, name: "诗意全译", target_language: "zh", provider: "deepseek",
  status: "published", coverage: {}, author_name: "Mira", author_picture: null,
  chapters_covered: 28, model_tags: ["deepseek-v4-flash"], published_at: "2026-08-30", likes: 0, comments: 0,
} as never;

test("published versions appear in a Community group and are selectable", () => {
  const { props } = renderPanel({ publishedSessions: [PUBLISHED] });
  const group = screen.getByTestId("community-versions");
  expect(group).toHaveTextContent("Mira");
  expect(group).toHaveTextContent("诗意全译");
  expect(group).toHaveTextContent("28/28 ch");
  // Sidebar rows stay compact — the model tag shows in the browse dialog
  expect(group).not.toHaveTextContent("deepseek-v4-flash");
  fireEvent.click(screen.getByRole("radio", { name: /诗意全译/ }));
  expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 77 }));
});

test("reading a community version shows the read-only notice, not the translate panel", () => {
  renderPanel({ publishedSessions: [PUBLISHED], activeSessionId: 77 });
  expect(screen.getByTestId("community-readonly")).toHaveTextContent("only its author can change it");
  expect(screen.queryByTestId("session-style-panel")).toBeNull();
  expect(screen.queryByTestId("translate-chapter-button")).toBeNull();
});

test("the Edit dialog carries Publish, and Unpublish once published", async () => {
  (api.publishTranslationSession as jest.Mock).mockResolvedValue({ ...SESSION, status: "published" });
  const { props } = renderPanel({ activeSessionId: 5 });
  fireEvent.click(screen.getByRole("button", { name: "Edit version 诗意版" }));
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await waitFor(() => expect(api.publishTranslationSession).toHaveBeenCalledWith(5));
  expect(props.onSessionsChanged).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ id: 5, status: "published" })]),
  );
});

test("an incomplete book explains what is left instead of publishing", async () => {
  (api.publishTranslationSession as jest.Mock).mockRejectedValue(new Error("nope"));
  (api.getSessionCompleteness as jest.Mock).mockResolvedValue({
    total_paragraphs: 980, translated_paragraphs: 412, complete: false,
    missing_chapters: new Array(17).fill({ chapter_index: 0, translated: 0, paragraphs: 1 }),
  });
  renderPanel({ activeSessionId: 5 });
  fireEvent.click(screen.getByRole("button", { name: "Edit version 诗意版" }));
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  // The shortfall is reported inside the dialog, where the action was
  const err = await screen.findByTestId("edit-dialog-error");
  expect(err).toHaveTextContent(/412 of 980 paragraphs done, 17 chapter/);
  // …and the dialog stays open so it can be acted on
  expect(screen.getByRole("dialog", { name: "Edit translation version" })).toBeInTheDocument();
});

test("the chat button on a version opens its likes-and-comments dialog", async () => {
  (api.listVersionComments as jest.Mock).mockResolvedValue({
    comments: [{ id: 301, user_id: 3, body: "整体很流畅", created_at: "", author_name: "Jonas" }],
  });
  (api.listReactions as jest.Mock).mockResolvedValue({ reactions: { "77": { count: 5, liked: false } } });
  (api.toggleReaction as jest.Mock).mockResolvedValue({ liked: true, count: 6 });
  (api.addVersionComment as jest.Mock).mockResolvedValue({
    id: 302, user_id: 9, body: "我也喜欢", created_at: "", author_name: "Me",
  });
  renderPanel({ publishedSessions: [PUBLISHED] });

  // Nothing inline in the sidebar — it opens from the row's chat button
  expect(screen.queryByTestId("version-discussion")).toBeNull();
  fireEvent.click(screen.getByTestId("version-discuss-77"));
  const dialog = await screen.findByTestId("version-discussion");
  expect(dialog).toHaveTextContent("诗意全译");
  expect(dialog).toHaveTextContent("by Mira");
  expect(await screen.findByTestId("version-comment-301")).toHaveTextContent("整体很流畅");

  const heart = screen.getByTestId("version-like");
  await waitFor(() => expect(heart).toHaveTextContent("5"));
  fireEvent.click(heart);
  await waitFor(() => expect(api.toggleReaction).toHaveBeenCalledWith("session", 77));
  await waitFor(() => expect(screen.getByTestId("version-like")).toHaveTextContent("6"));

  fireEvent.change(screen.getByLabelText("Version comment"), { target: { value: "我也喜欢" } });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));
  await waitFor(() => expect(api.addVersionComment).toHaveBeenCalledWith(77, "我也喜欢"));
  expect(await screen.findByTestId("version-comment-302")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Close discussion" }));
  expect(screen.queryByTestId("version-discussion")).toBeNull();
});

test("selecting a community row still reads it — the chat button does not", async () => {
  const { props } = renderPanel({ publishedSessions: [PUBLISHED] });
  fireEvent.click(screen.getByTestId("version-discuss-77"));
  expect(props.onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Close discussion" }));
  fireEvent.click(screen.getByRole("radio", { name: /诗意全译/ }));
  expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 77 }));
});

test("the sidebar shows the top few; More opens a searchable, paged dialog", async () => {
  const page1 = [
    { ...PUBLISHED, id: 81, name: "第一版", likes: 9, comments: 2 },
    { ...PUBLISHED, id: 82, name: "第二版", likes: 4, comments: 0 },
  ];
  (api.listPublishedSessions as jest.Mock)
    .mockResolvedValueOnce({ items: page1, has_more: true })
    .mockResolvedValueOnce({ items: [{ ...PUBLISHED, id: 83, name: "第三版", likes: 1, comments: 0 }], has_more: false });
  const { props } = renderPanel({ publishedSessions: [PUBLISHED] });

  fireEvent.click(screen.getByRole("button", { name: /More community translations/ }));
  const dialog = await screen.findByTestId("community-browse");
  await waitFor(() => expect(dialog).toHaveTextContent("第一版"));
  expect(dialog).toHaveTextContent("9"); // like count, ranked first

  // Load more appends the next page
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(screen.getByTestId("community-browse")).toHaveTextContent("第三版"));

  // Selecting from the dialog picks the version and closes it
  fireEvent.click(screen.getByRole("radio", { name: /第一版/ }));
  expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 81 }));
  expect(screen.queryByTestId("community-browse")).toBeNull();
});

test("searching the community dialog re-queries the server", async () => {
  (api.listPublishedSessions as jest.Mock).mockResolvedValue({ items: [], has_more: false });
  renderPanel({ publishedSessions: [PUBLISHED] });
  fireEvent.click(screen.getByRole("button", { name: /More community translations/ }));
  fireEvent.change(await screen.findByLabelText("Search community translations"), { target: { value: "Mira" } });
  await waitFor(() => expect(api.listPublishedSessions).toHaveBeenCalledWith(
    2229, expect.objectContaining({ q: "Mira", sort: "popular" }),
  ));
  expect(await screen.findByText("No translations match that search.")).toBeInTheDocument();
});

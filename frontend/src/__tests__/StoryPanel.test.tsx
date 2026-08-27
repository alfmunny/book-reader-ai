/**
 * Inline story panel (design: user-translations.md phase 2, #2752):
 * one panel for every share kind, with the discussion thread in place.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  listStoryComments: jest.fn(),
  addStoryComment: jest.fn(),
  deleteStory: jest.fn(),
  deleteStoryComment: jest.fn(),
}));

import * as api from "@/lib/api";
import StoryPanel from "@/components/StoryPanel";
import type { Story } from "@/lib/api";

const TRANSLATION_STORY: Story = {
  id: 1, user_id: 2, kind: "translation", book_id: 5, chapter_index: 0,
  session_id: 9, paragraph_start: 0, paragraph_end: 0, caption: "my poetic take",
  created_at: "2026-08-27", author_name: "Mira", comment_count: 1,
  session_name: "诗意版", target_language: "zh",
  paragraphs: [{ paragraph_index: 0, text: "太阳依着古老的方式轰鸣。", model: "deepseek-v4-flash" }],
};

const NOTE_STORY: Story = {
  id: 2, user_id: 3, kind: "note", book_id: 5, chapter_index: 0,
  annotation_id: 7, caption: null, created_at: "2026-08-27",
  author_name: "Jonas", comment_count: 0,
  sentence_text: "Die Sonne tönt.", note_text: "wonderful opening", color: "yellow",
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof StoryPanel>> = {}) {
  const props: React.ComponentProps<typeof StoryPanel> = {
    stories: [TRANSLATION_STORY, NOTE_STORY],
    paragraphIndex: 0,
    currentUserId: 2,
    onClose: jest.fn(),
    onChanged: jest.fn(),
    ...overrides,
  };
  return { ...render(<StoryPanel {...props} />), props };
}

beforeEach(() => {
  jest.clearAllMocks();
  (api.listStoryComments as jest.Mock).mockResolvedValue({ comments: [] });
});

test("renders both kinds: rendering with provenance, note with quote + thought", () => {
  renderPanel();
  expect(screen.getByText("太阳依着古老的方式轰鸣。")).toBeInTheDocument();
  expect(screen.getByText("诗意版")).toBeInTheDocument();
  expect(screen.getByText("deepseek-v4-flash")).toBeInTheDocument();
  expect(screen.getByText("my poetic take")).toBeInTheDocument();
  expect(screen.getByText("Die Sonne tönt.")).toBeInTheDocument();
  expect(screen.getByText("wonderful opening")).toBeInTheDocument();
});

test("expanding the discussion loads and posts comments", async () => {
  (api.listStoryComments as jest.Mock).mockResolvedValue({
    comments: [{ id: 11, story_id: 1, user_id: 3, body: "lovely", created_at: "", author_name: "Jonas" }],
  });
  (api.addStoryComment as jest.Mock).mockResolvedValue({
    id: 12, story_id: 1, user_id: 2, body: "thanks!", created_at: "", author_name: "Mira",
  });
  const { props } = renderPanel();

  fireEvent.click(screen.getByText("Discussion (1)"));
  expect(await screen.findByText("lovely")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Comment text"), { target: { value: "thanks!" } });
  fireEvent.click(screen.getByText("Post"));
  await waitFor(() => expect(api.addStoryComment).toHaveBeenCalledWith(1, "thanks!"));
  expect(await screen.findByText("thanks!")).toBeInTheDocument();
  expect(props.onChanged).toHaveBeenCalled();
});

test("delete appears only on the caller's own share", () => {
  renderPanel(); // currentUserId 2 owns the translation story only
  const own = screen.getByTestId("story-1");
  const foreign = screen.getByTestId("story-2");
  expect(own.querySelector('[aria-label="Delete this share"]')).not.toBeNull();
  expect(foreign.querySelector('[aria-label="Delete this share"]')).toBeNull();
});

test("deleting a share calls the API and notifies the parent", async () => {
  (api.deleteStory as jest.Mock).mockResolvedValue({ ok: true });
  const { props } = renderPanel();
  fireEvent.click(screen.getAllByLabelText("Delete this share")[0]);
  await waitFor(() => expect(api.deleteStory).toHaveBeenCalledWith(1));
  expect(props.onChanged).toHaveBeenCalled();
});

test("close button fires onClose", () => {
  const { props } = renderPanel();
  fireEvent.click(screen.getByLabelText("Close shares panel"));
  expect(props.onClose).toHaveBeenCalled();
});

test("authors render with an avatar — picture when set, initial disc otherwise", () => {
  renderPanel({
    stories: [
      { ...TRANSLATION_STORY, author_picture: "https://example.com/mira.png" },
      NOTE_STORY, // no picture → initial disc
    ],
  });
  const withPic = screen.getByTestId("story-1").querySelector("img") as HTMLImageElement;
  expect(withPic.src).toBe("https://example.com/mira.png");
  expect(screen.getByTestId("story-2")).toHaveTextContent("J"); // Jonas' initial
});

test("dialog opens BELOW the sentence, never covering it, arrow pointing up at it", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  renderPanel({ position: { x: 400, y: 200 } });
  const panel = screen.getByTestId("story-panel");
  expect(panel.style.top).toBe("224px"); // below the clicked line (y + 24)
  expect(panel.style.left).toBe("192px"); // centered on x, clamped
  const arrow = screen.getByTestId("story-panel-arrow");
  expect(arrow.className).toContain("-top-[7px]"); // on the top edge, pointing up
  expect(arrow.style.left).toBe("202px"); // at the sentence's x
  expect(screen.getByTestId("story-panel-backdrop")).toBeInTheDocument();
});

test("near the bottom the dialog flips ABOVE, its bottom edge hugging the sentence", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  renderPanel({ position: { x: 400, y: 700 } });
  const panel = screen.getByTestId("story-panel");
  // Bottom-anchored so short content never floats away from the sentence:
  // bottom = vh - y + 28 → the panel's bottom edge sits just above y=700.
  expect(panel.style.bottom).toBe("128px");
  expect(panel.style.top).toBe("");
  expect(screen.getByTestId("story-panel-arrow").className).toContain("-bottom-[7px]");
});

test("backdrop click closes the dialog", () => {
  const { props } = renderPanel({ position: { x: 400, y: 200 } });
  fireEvent.click(screen.getByTestId("story-panel-backdrop"));
  expect(props.onClose).toHaveBeenCalled();
});

test("without a position the panel keeps the corner/bottom-sheet layout", () => {
  renderPanel();
  const panel = screen.getByTestId("story-panel");
  expect(panel.style.left).toBe("");
  expect(panel.className).toContain("bottom-0");
});

test("sentence variant: my note pinned on top, no quote, no discussion UI", () => {
  renderPanel({
    variant: "sentence",
    myNote: { text: "my own thought", authorName: "Alfmunny", picture: null },
    stories: [NOTE_STORY],
  });
  const mine = screen.getByTestId("my-note");
  expect(mine).toHaveTextContent("My note");
  expect(mine).toHaveTextContent("my own thought");
  // Pinned card renders before the others in the list
  const panel = screen.getByTestId("story-panel");
  expect(panel.innerHTML.indexOf("my own thought")).toBeLessThan(panel.innerHTML.indexOf("wonderful opening"));
  // No quote (the sentence is visible in the text) and no discussion yet
  expect(screen.queryByText("Die Sonne tönt.")).toBeNull();
  expect(screen.queryByText(/Discussion/)).toBeNull();
});

test("toolbar shows the merged color row; current color marked", () => {
  const bar = { existingColor: "yellow", onColor: jest.fn() };
  renderPanel({
    variant: "sentence",
    myNote: { text: "mine", authorName: "Alfmunny", picture: null },
    annotationBar: bar,
    stories: [NOTE_STORY],
  });
  expect(screen.getByTestId("story-panel-toolbar")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Yellow" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Blue" }));
  expect(bar.onColor).toHaveBeenCalledWith("blue");
});

test("tapping my note shifts to the edit sub-page; back returns to the list", async () => {
  const onSaveMyNote = jest.fn().mockResolvedValue(undefined);
  renderPanel({
    variant: "sentence",
    myNote: { text: "old thought", authorName: "Alfmunny", picture: null },
    annotationBar: { existingColor: "yellow", onColor: jest.fn() },
    onSaveMyNote,
    stories: [NOTE_STORY],
  });
  fireEvent.click(screen.getByRole("button", { name: "Open my note" }));
  const editor = screen.getByTestId("my-note-editor");
  expect(editor).toBeInTheDocument();
  const textarea = screen.getByLabelText("My note text") as HTMLTextAreaElement;
  expect(textarea.value).toBe("old thought");
  // Back returns without saving
  fireEvent.click(screen.getByTestId("story-panel-back"));
  expect(screen.queryByTestId("my-note-editor")).toBeNull();
  expect(screen.getByTestId("my-note")).toBeInTheDocument();
  // Edit again and save
  fireEvent.click(screen.getByRole("button", { name: "Open my note" }));
  fireEvent.change(screen.getByLabelText("My note text"), { target: { value: "new thought" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSaveMyNote).toHaveBeenCalledWith("new thought"));
  expect(screen.queryByTestId("my-note-editor")).toBeNull();
});

test("deleting my note lives in the edit sub-page", async () => {
  const onDeleteMyNote = jest.fn().mockResolvedValue(undefined);
  renderPanel({
    variant: "sentence",
    myNote: { text: "mine", authorName: "Alfmunny", picture: null },
    onSaveMyNote: jest.fn(),
    onDeleteMyNote,
    stories: [NOTE_STORY],
  });
  fireEvent.click(screen.getByRole("button", { name: "Open my note" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete my note and highlight" }));
  await waitFor(() => expect(onDeleteMyNote).toHaveBeenCalled());
  expect(screen.queryByTestId("my-note-editor")).toBeNull();
});

test("Write note appears in the toolbar only without an existing note", () => {
  renderPanel({
    variant: "sentence",
    annotationBar: { onColor: jest.fn() },
    onSaveMyNote: jest.fn(),
    stories: [NOTE_STORY],
  });
  fireEvent.click(screen.getByRole("button", { name: "Write note" }));
  expect((screen.getByLabelText("My note text") as HTMLTextAreaElement).value).toBe("");
});

test("tapping a community note opens its detail page with author and delete for admins", async () => {
  (api.deleteStory as jest.Mock).mockResolvedValue({ ok: true });
  const { props } = renderPanel({
    variant: "sentence",
    isAdmin: true,
    stories: [NOTE_STORY],
  });
  fireEvent.click(screen.getByRole("button", { name: "Open note by Jonas" }));
  const detail = screen.getByTestId("story-detail");
  expect(detail).toHaveTextContent("Jonas");
  expect(detail).toHaveTextContent("wonderful opening");
  fireEvent.click(screen.getByRole("button", { name: "Delete this share" }));
  await waitFor(() => expect(api.deleteStory).toHaveBeenCalledWith(2));
  expect(props.onChanged).toHaveBeenCalled();
  // Returns to the list after deleting
  expect(screen.queryByTestId("story-detail")).toBeNull();
});

test("posts dialog: empty state plus publish composer, kept open after posting", async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  const { props } = renderPanel({
    variant: "sentence",
    stories: [],
    composer: {
      placeholder: "Say something…",
      submitLabel: "Publish my translation as a post",
      emptyText: "No posts on this paragraph yet — publish yours below.",
      onSubmit,
    },
  });
  expect(screen.getByTestId("posts-empty")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Post caption"), { target: { value: "my take" } });
  fireEvent.click(screen.getByRole("button", { name: "Publish my translation as a post" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("my take"));
  expect(props.onChanged).toHaveBeenCalled();
  expect(screen.getByTestId("post-composer")).toBeInTheDocument();
});

test("tapping a translation post opens its detail with the rendering", () => {
  renderPanel({
    variant: "sentence",
    stories: [TRANSLATION_STORY],
  });
  fireEvent.click(screen.getByRole("button", { name: "Open translation by Mira" }));
  const detail = screen.getByTestId("story-detail");
  expect(detail).toHaveTextContent("太阳依着古老的方式轰鸣。");
  expect(detail).toHaveTextContent("诗意版");
  expect(detail).toHaveTextContent("deepseek-v4-flash");
});

test("my versions pin first with avatar and Private/Posted badges; posted opens its post", () => {
  renderPanel({
    variant: "sentence",
    stories: [{ ...TRANSLATION_STORY, user_id: 9 }], // my own published post
    myVersions: [
      { sessionName: "诗意版", model: "deepseek-v4-flash", text: "太阳依着古老的方式轰鸣。", posted: true, storyId: 1, authorName: "Alfmunny", picture: null },
      { sessionName: "直译版", model: "deepseek-v4-flash", text: "太阳轰鸣如常。", posted: false, authorName: "Alfmunny", picture: null },
    ],
  });
  const posted = screen.getByTestId("my-version-0");
  expect(posted).toHaveTextContent("Posted");
  expect(posted).toHaveTextContent("A"); // avatar initial disc
  const priv = screen.getByTestId("my-version-1");
  expect(priv).toHaveTextContent("Private");
  // My published post is represented by the pinned card, not duplicated below
  expect(screen.queryByTestId("story-1")).toBeNull();
  // Tapping the posted card opens the post's detail
  fireEvent.click(screen.getByRole("button", { name: "Open my post from 诗意版" }));
  expect(screen.getByTestId("story-detail")).toBeInTheDocument();
});

test("a private version opens its own detail sub-page — the universal flow", () => {
  renderPanel({
    variant: "sentence",
    stories: [],
    composer: { placeholder: "p", submitLabel: "Post", emptyText: "none", onSubmit: jest.fn() },
    myVersions: [
      { sessionName: "直译版", model: "deepseek-v4-flash", text: "很长的诗行\n第二行\n第三行\n第四行", posted: false, authorName: "Alfmunny", picture: null },
    ],
  });
  // List card clamps its preview
  const card = screen.getByTestId("my-version-0");
  expect((card.querySelector("p.font-serif") as HTMLElement).className).toContain("line-clamp-3");
  // Tap → detail with full text, Private badge, back returns
  fireEvent.click(screen.getByRole("button", { name: "Open my version 直译版" }));
  const detail = screen.getByTestId("my-version-detail");
  expect(detail).toHaveTextContent("Private");
  expect(detail).toHaveTextContent("直译版");
  expect((detail.querySelector("p.font-serif") as HTMLElement).className).not.toContain("line-clamp-3");
  fireEvent.click(screen.getByTestId("story-panel-back"));
  expect(screen.queryByTestId("my-version-detail")).toBeNull();
  expect(screen.getByTestId("my-version-0")).toBeInTheDocument();
});

test("community translation cards clamp in the list — full text lives in detail", () => {
  renderPanel({ variant: "sentence", stories: [TRANSLATION_STORY] });
  const card = screen.getByTestId(`story-${TRANSLATION_STORY.id}`);
  expect(card.innerHTML).toContain("line-clamp-3");
});

test("post detail carries the comment thread: read, write, and switch versions", async () => {
  (api.listStoryComments as jest.Mock).mockResolvedValue({
    comments: [{ id: 31, story_id: 1, user_id: 3, body: "有味道", created_at: "", author_name: "Jonas" }],
  });
  (api.addStoryComment as jest.Mock).mockResolvedValue({
    id: 32, story_id: 1, user_id: 9, body: "谢谢！", created_at: "", author_name: "Me",
  });
  const second = { ...TRANSLATION_STORY, id: 5, author_name: "Jonas", session_name: "直译版" };
  renderPanel({
    variant: "sentence",
    stories: [TRANSLATION_STORY, second],
    initialStoryId: 1, // smart landing: straight into the read rendering's thread
    currentUserId: 9,
  });
  // Landed directly on detail with the thread loaded
  expect(screen.getByTestId("story-detail")).toBeInTheDocument();
  expect(await screen.findByText("有味道")).toBeInTheDocument();
  // Write a comment in place
  fireEvent.change(screen.getByLabelText("Comment text"), { target: { value: "谢谢！" } });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));
  await waitFor(() => expect(api.addStoryComment).toHaveBeenCalledWith(1, "谢谢！"));
  // Switch to another version via the chip strip
  fireEvent.click(screen.getByRole("tab", { name: "Jonas" }));
  expect(screen.getByTestId("story-detail")).toHaveTextContent("直译版");
});

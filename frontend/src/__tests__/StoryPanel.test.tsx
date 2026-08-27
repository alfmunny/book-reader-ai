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

test("anchored position renders the popover at the anchor (desktop)", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  renderPanel({ position: { x: 400, y: 200 } });
  const panel = screen.getByTestId("story-panel");
  expect(panel.style.left).toBe("208px"); // x - width/2
  expect(panel.style.top).toBe("210px"); // y + 10
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

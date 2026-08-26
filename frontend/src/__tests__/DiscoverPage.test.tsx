/**
 * Discover feed (phase 2, #2752): recent shares across all books, each
 * linking into the reader at its anchor.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "t", backendUser: { id: 9 } } }),
}));
jest.mock("@/components/SiteHeader", () => {
  const SiteHeader = () => <div data-testid="site-header" />;
  SiteHeader.displayName = "SiteHeader";
  return SiteHeader;
});
jest.mock("@/lib/api", () => ({
  getStoryFeed: jest.fn(),
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
}));

import * as api from "@/lib/api";
import DiscoverPage from "@/app/discover/page";

const FEED = [
  {
    id: 1, user_id: 2, kind: "translation", book_id: 5, chapter_index: 0,
    caption: "poetic take", created_at: "", author_name: "Mira", comment_count: 3,
    session_name: "诗意版", target_language: "zh", book_title: "Faust",
    paragraphs: [{ paragraph_index: 0, text: "太阳依着古老的方式轰鸣。", model: "deepseek-v4-flash" }],
  },
  {
    id: 2, user_id: 3, kind: "note", book_id: 5, chapter_index: 2,
    caption: null, created_at: "", author_name: "Jonas", comment_count: 0,
    sentence_text: "Die Sonne tönt.", note_text: "wonderful", book_title: "Faust",
  },
];

beforeEach(() => jest.clearAllMocks());

test("renders feed cards with author, content, and reader link", async () => {
  (api.getStoryFeed as jest.Mock).mockResolvedValue({ stories: FEED });
  render(<DiscoverPage />);

  expect(await screen.findByText("Mira")).toBeInTheDocument();
  expect(screen.getByText("太阳依着古老的方式轰鸣。")).toBeInTheDocument();
  expect(screen.getByText("诗意版")).toBeInTheDocument();
  expect(screen.getByText("wonderful")).toBeInTheDocument();
  const link = screen.getByRole("link", { name: /Faust · chapter 1/ });
  expect(link).toHaveAttribute("href", "/reader/5?chapter=0");
  // Note story links to its own chapter
  expect(screen.getByRole("link", { name: /Faust · chapter 3/ })).toHaveAttribute("href", "/reader/5?chapter=2");
});

test("empty feed shows the empty state with a CTA", async () => {
  (api.getStoryFeed as jest.Mock).mockResolvedValue({ stories: [] });
  render(<DiscoverPage />);
  expect(await screen.findByText("Nothing shared yet")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open a book" })).toHaveAttribute("href", "/");
});

test("feed failure shows an error, not a blank page", async () => {
  (api.getStoryFeed as jest.Mock).mockRejectedValue(new Error("nope"));
  render(<DiscoverPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the feed");
});

test("Following tab refetches with the scope and shows its own empty state", async () => {
  (api.getStoryFeed as jest.Mock).mockResolvedValue({ stories: [] });
  render(<DiscoverPage />);
  await screen.findByText("Nothing shared yet");
  fireEvent.click(screen.getByRole("tab", { name: "Following" }));
  await waitFor(() => expect(api.getStoryFeed).toHaveBeenLastCalledWith("following"));
  expect(await screen.findByText("Your timeline is quiet")).toBeInTheDocument();
});

test("Follow button toggles and calls the API; own stories get no button", async () => {
  (api.getStoryFeed as jest.Mock).mockResolvedValue({
    stories: [
      { ...FEED[0], following_author: false },
      { ...FEED[1], user_id: 9 }, // the viewer's own share
    ],
  });
  (api.followUser as jest.Mock).mockResolvedValue({ ok: true });
  render(<DiscoverPage />);

  const followBtn = await screen.findByRole("button", { name: "Follow Mira" });
  fireEvent.click(followBtn);
  await waitFor(() => expect(api.followUser).toHaveBeenCalledWith(2));
  expect(await screen.findByRole("button", { name: "Unfollow Mira" })).toBeInTheDocument();
  // Own story (user_id 9) shows no follow control
  expect(screen.queryByRole("button", { name: /Follow Jonas/ })).toBeNull();
});

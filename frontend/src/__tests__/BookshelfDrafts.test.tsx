/**
 * The bookshelf carries an unfinished audit until the reader says it is done.
 *
 * The draft itself persists server-side, but without this section there is no way
 * back to a half-audited book short of remembering its URL.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({ useSession: (...a: unknown[]) => mockUseSession(...a) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockGetDraftAudits = jest.fn();
const mockGetRecentBooks = jest.fn();
const mockGetMyUploads = jest.fn();

jest.mock("@/lib/api", () => ({
  getMe: () => Promise.resolve({ role: "user" }),
  getReadingProgress: () => Promise.resolve([]),
  getUserStats: () => Promise.resolve({
    streak: 0, longest_streak: 0,
    totals: { books_started: 0, vocabulary_words: 0, annotations: 0, insights: 0 },
    activity: [],
  }),
  getDraftAudits: (...a: unknown[]) => mockGetDraftAudits(...a),
  getMyUploads: (...a: unknown[]) => mockGetMyUploads(...a),
}));

jest.mock("@/lib/recentBooks", () => ({
  getRecentBooks: (...a: unknown[]) => mockGetRecentBooks(...a),
  removeRecentBook: jest.fn(),
  recordRecentBook: jest.fn(),
}));

jest.mock("@/components/SiteHeader", () => {
  const SiteHeader = () => null;
  SiteHeader.displayName = "SiteHeader";
  return { __esModule: true, default: SiteHeader };
});

import Bookshelf from "@/app/bookshelf/page";

const DRAFT = {
  book_id: 501,
  title: "Der Zauberberg",
  authors: ["Thomas Mann"],
  chapter_count: 118,
  reviewed_count: 31,
  updated_at: "2026-08-24T10:00:00",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({
    data: { backendUser: { name: "Reader", picture: "" } },
    status: "authenticated",
  });
  mockGetRecentBooks.mockReturnValue([]);
  mockGetDraftAudits.mockResolvedValue([DRAFT]);
  mockGetMyUploads.mockResolvedValue([]);
});

it("lists a book still being audited", async () => {
  render(<Bookshelf />);
  // The title appears twice for a coverless book — in the generated cover and as
  // the row label. Assert the section, which is what this test is about.
  const list = await screen.findByRole("list", { name: /still reviewing/i });
  expect(list).toHaveTextContent("Der Zauberberg");
});

it("says how far in you are", async () => {
  render(<Bookshelf />);
  expect(await screen.findByText("31 of 118 chapters reviewed")).toBeInTheDocument();
});

it("exposes progress to assistive tech, not just as a bar", async () => {
  render(<Bookshelf />);
  const bar = await screen.findByRole("progressbar", { name: /Der Zauberberg review progress/i });
  expect(bar).toHaveAttribute("aria-valuenow", "31");
  expect(bar).toHaveAttribute("aria-valuemax", "118");
});

it("offers to continue where you stopped", async () => {
  render(<Bookshelf />);
  const link = await screen.findByRole("link", { name: /continue audit/i });
  expect(link).toHaveAttribute("href", "/upload/501/chapters");
});

it("changes the call to action once every chapter is reviewed", async () => {
  mockGetDraftAudits.mockResolvedValue([{ ...DRAFT, reviewed_count: 118 }]);
  render(<Bookshelf />);
  expect(await screen.findByRole("link", { name: /add to shelf/i })).toBeInTheDocument();
  expect(screen.getByText(/All 118 chapters reviewed — ready/)).toBeInTheDocument();
});

it("hides the section entirely when nothing is in progress", async () => {
  mockGetDraftAudits.mockResolvedValue([]);
  render(<Bookshelf />);
  await screen.findByText(/bookshelf is empty|Nothing on the shelf/i);
  expect(screen.queryByRole("heading", { name: /in progress/i })).not.toBeInTheDocument();
});

it("an empty shelf with work in flight points at the work, not at the library", async () => {
  render(<Bookshelf />);
  expect(await screen.findByText(/Nothing on the shelf yet/i)).toBeInTheDocument();
  expect(screen.getByText(/part-way through review/i)).toBeInTheDocument();
});

it("an empty shelf with no drafts sends you to the library", async () => {
  mockGetDraftAudits.mockResolvedValue([]);
  render(<Bookshelf />);
  expect(await screen.findByText(/Your bookshelf is empty/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /browse the library/i })).toBeInTheDocument();
});

it("a failed drafts fetch does not take the shelf down with it", async () => {
  mockGetDraftAudits.mockRejectedValue(new Error("offline"));
  mockGetRecentBooks.mockReturnValue([
    { id: 1, title: "Faust", authors: ["Goethe"], cover: "", lastChapter: 0, lastRead: Date.now() },
  ]);
  render(<Bookshelf />);
  expect((await screen.findAllByText("Faust")).length).toBeGreaterThan(0);
});

it("guards against a zero-chapter draft rather than dividing by zero", async () => {
  mockGetDraftAudits.mockResolvedValue([{ ...DRAFT, chapter_count: 0, reviewed_count: 0 }]);
  render(<Bookshelf />);
  const bar = await screen.findByRole("progressbar", { name: /review progress/i });
  expect(bar.firstChild).toHaveStyle({ width: "0%" });
  expect(screen.getByRole("link", { name: /continue audit/i })).toBeInTheDocument();
});

// ── the ownership badge ───────────────────────────────────────────────────────

it("marks a shelf book the reader uploaded themselves", async () => {
  mockGetRecentBooks.mockReturnValue([
    { id: 501, title: "Der Zauberberg", authors: ["Mann"], cover: "", lastChapter: 0, lastRead: Date.now() },
  ]);
  mockGetDraftAudits.mockResolvedValue([]);
  mockGetMyUploads.mockResolvedValue([{ id: 501, title: "Der Zauberberg" }]);
  render(<Bookshelf />);
  expect(await screen.findByText("Your upload")).toBeInTheDocument();
});

it("leaves library books unmarked", async () => {
  mockGetRecentBooks.mockReturnValue([
    { id: 1342, title: "Pride and Prejudice", authors: ["Austen"], cover: "", lastChapter: 0, lastRead: Date.now() },
  ]);
  mockGetDraftAudits.mockResolvedValue([]);
  mockGetMyUploads.mockResolvedValue([{ id: 501, title: "Other" }]);
  render(<Bookshelf />);
  await screen.findAllByText("Pride and Prejudice");
  expect(screen.queryByText("Your upload")).not.toBeInTheDocument();
});

it("a failed uploads fetch just means no badges, not a broken shelf", async () => {
  mockGetRecentBooks.mockReturnValue([
    { id: 501, title: "Der Zauberberg", authors: ["Mann"], cover: "", lastChapter: 0, lastRead: Date.now() },
  ]);
  mockGetDraftAudits.mockResolvedValue([]);
  mockGetMyUploads.mockRejectedValue(new Error("offline"));
  render(<Bookshelf />);
  expect((await screen.findAllByText("Der Zauberberg")).length).toBeGreaterThan(0);
  expect(screen.queryByText("Your upload")).not.toBeInTheDocument();
});

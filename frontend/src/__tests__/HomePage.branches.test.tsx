/**
 * HomePage — branch coverage for lines not yet covered:
 *   35:  timeAgo "d ago" branch (>= 24 hours old)
 *   73-78: getReadingProgress merges backend progress when entry found and newer
 *   82-83: getReadingProgress sets localStorage and updates recentBooks when changed
 *   116:   getPopularBooks catch branch → sets empty books and total 0
 *   216:   "Your Notes" tab click navigates to /notes
 *   253-255: onRemove: confirm + removeRecentBook + setRecentBooks
 *   297:   handleSearch: lang selector changes query lang
 *   426:   popular books list loading skeleton in list view
 *   452:   popular books list view shows book cover image when cover exists
 */

import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockGetPopularBooks = jest.fn();
const mockGetMe = jest.fn();
const mockSearchBooks = jest.fn();
const mockGetReadingProgress = jest.fn();

jest.mock("@/lib/api", () => ({
  getPopularBooks: (...args: unknown[]) => mockGetPopularBooks(...args),
  getMe: (...args: unknown[]) => mockGetMe(...args),
  searchBooks: (...args: unknown[]) => mockSearchBooks(...args),
  getReadingProgress: (...args: unknown[]) => mockGetReadingProgress(...args),
  getUserStats: () => Promise.resolve({ streak: 0, longest_streak: 0, totals: { books_started: 0, vocabulary_words: 0, annotations: 0, insights: 0 }, activity: [] }),
}));

const mockGetRecentBooks = jest.fn();
const mockRemoveRecentBook = jest.fn();

jest.mock("@/lib/recentBooks", () => ({
  getRecentBooks: (...args: unknown[]) => mockGetRecentBooks(...args),
  removeRecentBook: (...args: unknown[]) => mockRemoveRecentBook(...args),
}));

jest.mock("@/components/BookCard", () => {
  const BookCard = ({ book, onClick, badge, onRemove }: {
    book: { id: number; title: string; authors: string[] };
    onClick?: () => void;
    badge?: string;
    onRemove?: () => void;
  }) => (
    <div data-testid={`book-card-${book.id}`}>
      <button onClick={onClick}>{book.title}</button>
      {badge && <span>{badge}</span>}
      {onRemove && <button onClick={onRemove} aria-label={`remove-${book.title}`}>Remove</button>}
    </div>
  );
  BookCard.displayName = "BookCard";
  return { __esModule: true, default: BookCard };
});

jest.mock("@/components/BookDetailModal", () => {
  const BookDetailModal = ({
    book,
    onClose,
    onRead,
  }: {
    book: { id: number; title: string };
    onClose: () => void;
    onRead: () => void;
  }) => (
    <div data-testid="book-detail-modal">
      <span>{book.title}</span>
      <button onClick={onClose}>Close</button>
      <button onClick={onRead}>Read</button>
    </div>
  );
  BookDetailModal.displayName = "BookDetailModal";
  return { __esModule: true, default: BookDetailModal };
});

function makeBook(id: number, title = `Book ${id}`, cover = "") {
  return {
    id,
    title,
    authors: [`Author ${id}`],
    languages: ["en"],
    subjects: [],
    download_count: id * 100,
    cover,
  };
}

function makePopularResponse(books = [makeBook(1), makeBook(2), makeBook(3)], total = 3) {
  return { books, total, page: 1, per_page: 50 };
}

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

let Home: React.ComponentType;
beforeAll(async () => {
  const mod = await import("@/app/page");
  Home = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRecentBooks.mockReturnValue([]);
  mockGetMe.mockResolvedValue({ hasGeminiKey: true, role: "user", approved: true });
  mockGetPopularBooks.mockResolvedValue(makePopularResponse());
  mockSearchBooks.mockResolvedValue({ books: [] });
  mockGetReadingProgress.mockResolvedValue([]);
  mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
});

async function renderHome() {
  render(<Home />);
  await act(flushPromises);
  await act(flushPromises);
}

// ── Line 35: timeAgo "d ago" branch (>= 24 hours) ───────────────────────────

describe("HomePage — timeAgo d ago branch (line 35)", () => {
  it("shows badge with 'd ago' for books read more than 24h ago", async () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const RECENT = [
      {
        id: 1,
        title: "Old Book",
        authors: ["Author"],
        languages: ["en"],
        lastChapter: 0,
        lastRead: twoDaysAgo,
      },
    ];
    mockGetRecentBooks.mockReturnValue(RECENT);
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" } },
      status: "authenticated",
    });
    mockGetReadingProgress.mockResolvedValue([]);

    render(<Home />);
    await act(flushPromises);
    await act(flushPromises);

    // Badge should show "2d ago" (or similar) — appears in both Continue Reading card and book grid
    expect(screen.getAllByText(/\dd ago/i).length).toBeGreaterThan(0);
  });

  it("shows 'just now' for books read less than 1 minute ago", async () => {
    const justNow = Date.now() - 30000; // 30 seconds ago
    const RECENT = [
      {
        id: 2,
        title: "Recent Book",
        authors: ["Author"],
        languages: ["en"],
        lastChapter: 1,
        lastRead: justNow,
      },
    ];
    mockGetRecentBooks.mockReturnValue(RECENT);
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" } },
      status: "authenticated",
    });
    mockGetReadingProgress.mockResolvedValue([]);

    render(<Home />);
    await act(flushPromises);
    await act(flushPromises);

    expect(screen.getAllByText(/just now/i).length).toBeGreaterThan(0);
  });

  it("shows 'h ago' for books read 2 hours ago", async () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const RECENT = [
      {
        id: 3,
        title: "Hour Old Book",
        authors: ["Author"],
        languages: ["en"],
        lastChapter: 0,
        lastRead: twoHoursAgo,
      },
    ];
    mockGetRecentBooks.mockReturnValue(RECENT);
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" } },
      status: "authenticated",
    });
    mockGetReadingProgress.mockResolvedValue([]);

    render(<Home />);
    await act(flushPromises);
    await act(flushPromises);

    expect(screen.getAllByText(/2h ago/i).length).toBeGreaterThan(0);
  });
});

// ── Lines 73-78 & 82-83: reading progress merges when newer/different ────────

describe("HomePage — getReadingProgress merges backend data (lines 73-83)", () => {
  it("merges backend progress when backend chapter is newer", async () => {
    const localRead = Date.now() - 60000;
    const backendRead = new Date(Date.now()).toISOString(); // newer

    const RECENT = [
      {
        id: 10,
        title: "Merged Book",
        authors: ["Author"],
        languages: ["en"],
        lastChapter: 0,
        lastRead: localRead,
      },
    ];
    mockGetRecentBooks.mockReturnValue(RECENT);
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" } },
      status: "authenticated",
    });

    // Backend has newer progress (chapter 3)
    mockGetReadingProgress.mockResolvedValue([
      { book_id: 10, chapter_index: 3, last_read: backendRead },
    ]);

    const setItemSpy = jest.spyOn(Storage.prototype, "setItem");

    render(<Home />);
    await act(flushPromises);
    await act(flushPromises);
    await act(flushPromises);

    // localStorage.setItem should have been called with updated merged data
    expect(setItemSpy).toHaveBeenCalledWith(
      "recent_books",
      expect.any(String),
    );
    setItemSpy.mockRestore();
  });

  it("does not update state when no entries match local books", async () => {
    const RECENT = [
      {
        id: 11,
        title: "No Match Book",
        authors: ["Author"],
        languages: ["en"],
        lastChapter: 0,
        lastRead: Date.now(),
      },
    ];
    mockGetRecentBooks.mockReturnValue(RECENT);
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" } },
      status: "authenticated",
    });

    // Backend has progress for a different book (id=99)
    mockGetReadingProgress.mockResolvedValue([
      { book_id: 99, chapter_index: 5, last_read: new Date().toISOString() },
    ]);

    const setItemSpy = jest.spyOn(Storage.prototype, "setItem");

    render(<Home />);
    await act(flushPromises);
    await act(flushPromises);

    // localStorage.setItem should NOT be called (no change)
    expect(setItemSpy).not.toHaveBeenCalledWith("recent_books", expect.any(String));
    setItemSpy.mockRestore();
  });

  it("merges when local chapter index differs from backend", async () => {
    const RECENT = [
      {
        id: 12,
        title: "Chapter Diff Book",
        authors: ["Author"],
        languages: ["en"],
        lastChapter: 2,
        lastRead: Date.now() - 100,
      },
    ];
    mockGetRecentBooks.mockReturnValue(RECENT);
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" } },
      status: "authenticated",
    });

    const oldTs = new Date(Date.now() - 200).toISOString(); // older than local
    mockGetReadingProgress.mockResolvedValue([
      { book_id: 12, chapter_index: 4, last_read: oldTs }, // different chapter
    ]);

    const setItemSpy = jest.spyOn(Storage.prototype, "setItem");

    render(<Home />);
    await act(flushPromises);
    await act(flushPromises);
    await act(flushPromises);

    // chapter_index differs so merged[idx] gets updated
    expect(setItemSpy).toHaveBeenCalledWith("recent_books", expect.any(String));
    setItemSpy.mockRestore();
  });
});

// ── Line 116: getPopularBooks catch branch ────────────────────────────────────

describe("HomePage — getPopularBooks error (line 116)", () => {
  it("sets empty popular books when API fails", async () => {
    mockGetPopularBooks.mockRejectedValue(new Error("Network error"));

    await renderHome();

    // Should show "No popular books available yet."
    await waitFor(() =>
      expect(screen.getByText("No popular books available yet.")).toBeInTheDocument(),
    );
  });
});

// ── Line 216: "Your Notes" tab navigates to /notes ───────────────────────────

describe("HomePage — Your Notes tab (line 216)", () => {
  it("navigates to /notes when Your Notes tab is clicked", async () => {
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" } },
      status: "authenticated",
    });
    mockGetReadingProgress.mockResolvedValue([]);

    const user = userEvent.setup();
    render(<Home />);
    await act(flushPromises);

    const notesTab = screen.getByRole("button", { name: "Your Notes" });
    await user.click(notesTab);

    expect(mockPush).toHaveBeenCalledWith("/notes");
  });
});

// ── Lines 253-255: library book onRemove handler ──────────────────────────────

describe("HomePage — onRemove handler (lines 253-255)", () => {
  it("calls removeRecentBook and updates state when confirm is true", async () => {
    const RECENT = [
      {
        id: 20,
        title: "Remove Me Book",
        authors: ["Author"],
        languages: ["en"],
        lastChapter: 1,
        lastRead: Date.now() - 1000,
      },
    ];
    mockGetRecentBooks.mockReturnValue(RECENT);
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" } },
      status: "authenticated",
    });
    mockGetReadingProgress.mockResolvedValue([]);

    jest.spyOn(window, "confirm").mockReturnValue(true);
    // After remove, getRecentBooks returns empty
    mockGetRecentBooks.mockReturnValueOnce(RECENT).mockReturnValue([]);

    const user = userEvent.setup();
    render(<Home />);
    await act(flushPromises);
    await act(flushPromises);

    const removeBtn = screen.getByRole("button", { name: /remove-Remove Me Book/i });
    await user.click(removeBtn);

    expect(mockRemoveRecentBook).toHaveBeenCalledWith(20);
    expect(mockGetRecentBooks).toHaveBeenCalled();
  });

  it("does not call removeRecentBook when confirm is cancelled", async () => {
    const RECENT = [
      {
        id: 21,
        title: "Keep Me Book",
        authors: ["Author"],
        languages: ["en"],
        lastChapter: 0,
        lastRead: Date.now() - 1000,
      },
    ];
    mockGetRecentBooks.mockReturnValue(RECENT);
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" } },
      status: "authenticated",
    });
    mockGetReadingProgress.mockResolvedValue([]);

    jest.spyOn(window, "confirm").mockReturnValue(false);

    const user = userEvent.setup();
    render(<Home />);
    await act(flushPromises);
    await act(flushPromises);

    const removeBtn = screen.getByRole("button", { name: /remove-Keep Me Book/i });
    await user.click(removeBtn);

    expect(mockRemoveRecentBook).not.toHaveBeenCalled();
  });
});

// ── Line 297: language selector changes search lang ──────────────────────────

describe("HomePage — search language selector (line 297)", () => {
  it("changes lang state when language selector is changed", async () => {
    mockSearchBooks.mockResolvedValue({ books: [makeBook(50, "Faust")] });

    const user = userEvent.setup();
    await renderHome();

    const langSelect = screen.getByRole("combobox");
    await user.selectOptions(langSelect, "de");

    // Now search with de language
    const input = screen.getByPlaceholderText(/Search by title or author/i);
    await user.type(input, "Faust");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(mockSearchBooks).toHaveBeenCalledWith("Faust", "de"));
  });
});

// ── Line 426: popular books list view loading skeleton ────────────────────────

describe("HomePage — popular books list view loading skeleton (line 426)", () => {
  it("shows list-view skeleton when popularLoading and view is list", async () => {
    let resolve: (v: unknown) => void;
    mockGetPopularBooks.mockReturnValue(new Promise((r) => { resolve = r; }));

    const user = userEvent.setup();
    render(<Home />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // Switch to list view
    const listViewBtn = screen.getByTitle("List view");
    await user.click(listViewBtn);

    // Should show list skeleton (divide-y container with animate-pulse items)
    const pulseItems = document.querySelectorAll(".animate-pulse");
    expect(pulseItems.length).toBeGreaterThan(0);

    resolve!(makePopularResponse());
  });
});

// ── Line 452: popular books list view with cover image ────────────────────────

describe("HomePage — popular books list view with cover image (line 452)", () => {
  it("renders img element for books with a cover in list view", async () => {
    const bookWithCover = makeBook(77, "Faust with Cover", "https://cover.example.com/77.jpg");
    mockGetPopularBooks.mockResolvedValue(makePopularResponse([bookWithCover]));

    const user = userEvent.setup();
    await renderHome();

    // Switch to list view
    const listViewBtn = screen.getByTitle("List view");
    await user.click(listViewBtn);

    await waitFor(() => {
      const img = document.querySelector('img[src="https://cover.example.com/77.jpg"]');
      expect(img).toBeInTheDocument();
    });
  });

  it("renders SVG placeholder for books without cover in list view", async () => {
    const bookNoCover = makeBook(78, "No Cover Book", "");
    mockGetPopularBooks.mockResolvedValue(makePopularResponse([bookNoCover]));

    const user = userEvent.setup();
    await renderHome();

    const listViewBtn = screen.getByTitle("List view");
    await user.click(listViewBtn);

    await waitFor(() => {
      expect(document.querySelector("svg")).toBeInTheDocument();
    });
  });

  it("shows download count in list view when > 0", async () => {
    const book = makeBook(79, "Popular Book", "");
    mockGetPopularBooks.mockResolvedValue(makePopularResponse([book]));

    const user = userEvent.setup();
    await renderHome();

    const listViewBtn = screen.getByTitle("List view");
    await user.click(listViewBtn);

    await waitFor(() => {
      // download_count is id*100 = 7900, which renders as "7,900"
      expect(screen.getByText("7,900")).toBeInTheDocument();
    });
  });
});

// ── Pagination ────────────────────────────────────────────────────────────────

describe("HomePage — popular books pagination", () => {
  it("shows pagination when total > PER_PAGE (50)", async () => {
    // Total 100 > 50 = 2 pages
    mockGetPopularBooks.mockResolvedValue(
      makePopularResponse(
        Array.from({ length: 50 }, (_, i) => makeBook(i + 1)),
        100,
      ),
    );

    await renderHome();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /prev/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
  });

  it("clicking Next goes to page 2", async () => {
    const page1Books = Array.from({ length: 50 }, (_, i) => makeBook(i + 1));
    const page2Books = [makeBook(51, "Page 2 Book")];

    mockGetPopularBooks
      .mockResolvedValueOnce(makePopularResponse(page1Books, 51))
      .mockResolvedValueOnce(makePopularResponse(page2Books, 51));

    const user = userEvent.setup();
    await renderHome();

    await waitFor(() => expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() =>
      expect(mockGetPopularBooks).toHaveBeenCalledTimes(2),
    );
  });

  it("Prev button is disabled on page 1", async () => {
    mockGetPopularBooks.mockResolvedValue(
      makePopularResponse(
        Array.from({ length: 50 }, (_, i) => makeBook(i + 1)),
        100,
      ),
    );

    await renderHome();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /prev/i })).toBeInTheDocument(),
    );

    const prevBtn = screen.getByRole("button", { name: /prev/i });
    expect(prevBtn).toBeDisabled();
  });
});

// ── Profile picture branch ─────────────────────────────────────────────────────

describe("HomePage — profile picture branch", () => {
  it("renders profile image when session has picture", async () => {
    mockUseSession.mockReturnValue({
      data: {
        backendToken: "tok",
        backendUser: {
          id: 1,
          name: "Alice",
          picture: "https://example.com/avatar.jpg",
        },
      },
      status: "authenticated",
    });
    mockGetReadingProgress.mockResolvedValue([]);

    await renderHome();

    const profileImg = document.querySelector('img[src="https://example.com/avatar.jpg"]');
    expect(profileImg).toBeInTheDocument();
  });
});

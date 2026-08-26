/**
 * Tests for the Home page (/).
 * Covers: initial render, library/discover tabs, signed-in/out states,
 * book list rendering, search functionality, and error states.
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── next-auth ────────────────────────────────────────────────────────────────
const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

// ─── next/navigation ─────────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ─── @/lib/api ────────────────────────────────────────────────────────────────
const mockGetCatalogBooks = jest.fn();
const mockGetPopularBooks = jest.fn();
const mockGetMe = jest.fn();
const mockSearchBooks = jest.fn();
const mockGetReadingProgress = jest.fn();
const mockGetUserStats = jest.fn();

jest.mock("@/lib/api", () => ({
  // The bookshelf lists unfinished audits and marks the reader's own uploads.
  getDraftAudits: () => Promise.resolve([]),
  getMyUploads: () => Promise.resolve([]),
  getCatalogBooks: (...args: unknown[]) => mockGetCatalogBooks(...args),
  getPopularBooks: (...args: unknown[]) => mockGetPopularBooks(...args),
  getMe: (...args: unknown[]) => mockGetMe(...args),
  searchBooks: (...args: unknown[]) => mockSearchBooks(...args),
  getReadingProgress: (...args: unknown[]) => mockGetReadingProgress(...args),
  getUserStats: (...args: unknown[]) => mockGetUserStats(...args),
}));

// ─── @/lib/recentBooks ───────────────────────────────────────────────────────
const mockGetRecentBooks = jest.fn();
const mockRemoveRecentBook = jest.fn();

jest.mock("@/lib/recentBooks", () => ({
  getRecentBooks: (...args: unknown[]) => mockGetRecentBooks(...args),
  removeRecentBook: (...args: unknown[]) => mockRemoveRecentBook(...args),
}));

// ─── Heavy components ─────────────────────────────────────────────────────────
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────
function makeBook(id: number, title = `Book ${id}`) {
  return {
    id,
    title,
    authors: [`Author ${id}`],
    languages: ["en"],
    subjects: [],
    download_count: id * 100,
    cover: "",
  };
}

function makePopularResponse(books = [makeBook(1), makeBook(2), makeBook(3)], total = 3) {
  return { books, total, page: 1, per_page: 50 };
}

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

let Home: React.ComponentType;
let Bookshelf: React.ComponentType;
beforeAll(async () => {
  Home = (await import("@/app/page")).default;
  Bookshelf = (await import("@/app/bookshelf/page")).default;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRecentBooks.mockReturnValue([]);
  mockGetMe.mockResolvedValue({ hasGeminiKey: true, role: "user", approved: true });
  mockGetCatalogBooks.mockResolvedValue([]);
  mockGetPopularBooks.mockResolvedValue(makePopularResponse());
  mockSearchBooks.mockResolvedValue({ books: [] });
  mockGetReadingProgress.mockResolvedValue([]);
  mockGetUserStats.mockResolvedValue({ streak: 0, longest_streak: 0, totals: { books_started: 0, vocabulary_words: 0, annotations: 0, insights: 0 }, activity: [] });
  mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
});

// ─── Render helper ────────────────────────────────────────────────────────────
async function renderHome() {
  render(<Home />);
  await act(flushPromises);
  await act(flushPromises);
}

async function renderBookshelf() {
  render(<Bookshelf />);
  await act(flushPromises);
  await act(flushPromises);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HomePage — initial render", () => {
  it("renders the app title", async () => {
    await renderHome();
    expect(screen.getByText("Book Reader AI")).toBeInTheDocument();
  });

  it("renders the subtitle", async () => {
    await renderHome();
    expect(screen.getByText(/Public domain classics with AI assistance/i)).toBeInTheDocument();
  });

  it("shows Sign in link when unauthenticated", async () => {
    await renderHome();
    // Both the header "Sign in" and the hero "Sign in free" links are present
    // for unauthenticated visitors; check at least one points to /login.
    const signInLinks = screen.getAllByRole("link", { name: /Sign in/i });
    expect(signInLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("Sign in link navigates to /login", async () => {
    await renderHome();
    // Header "Sign in" link (exact text, not the hero's "Sign in free")
    const signInLink = screen.getByRole("link", { name: "Sign in" });
    expect(signInLink).toHaveAttribute("href", "/login");
  });

});

describe("HomePage — signed-in state", () => {
  const SESSION = {
    backendToken: "test-token",
    backendUser: { id: 1, name: "Alice", picture: "" },
    user: { id: 1 },
  };

  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: SESSION, status: "authenticated" });
    mockGetReadingProgress.mockResolvedValue([]);
  });

  it("shows profile link instead of Sign in", async () => {
    await renderHome();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("shows profile initial when no picture", async () => {
    await renderHome();
    // Profile button shows first letter of name
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("profile link navigates to /profile", async () => {
    await renderHome();
    const profileLink = screen.getByTitle("Alice — Profile & Settings");
    expect(profileLink).toHaveAttribute("href", "/profile");
  });

  it("shows 'Your Notes' tab when authenticated", async () => {
    await renderHome();
    expect(screen.getByRole("link", { name: "Your Notes" })).toBeInTheDocument();
  });

  it("shows 'Your Word List' tab when authenticated", async () => {
    await renderHome();
    expect(screen.getByRole("link", { name: "Your Word List" })).toBeInTheDocument();
  });

  it("navigates to /vocabulary when 'Your Word List' is clicked", async () => {
    await renderHome();
    const link = screen.getByRole("link", { name: "Your Word List" });
    expect(link).toHaveAttribute("href", "/vocabulary");
  });

  it("calls getMe on mount", async () => {
    await renderHome();
    await waitFor(() => expect(mockGetMe).toHaveBeenCalled());
  });

  it("shows Admin tab for admin users", async () => {
    mockGetMe.mockResolvedValue({ hasGeminiKey: true, role: "admin", approved: true });
    await renderHome();
    await waitFor(() => {
      expect(screen.queryByTestId("admin-tab")).toBeInTheDocument();
    });
  });

  it("does not show Admin tab for regular users", async () => {
    mockGetMe.mockResolvedValue({ hasGeminiKey: true, role: "user", approved: true });
    await renderHome();
    await act(flushPromises);
    expect(screen.queryByTestId("admin-tab")).not.toBeInTheDocument();
  });

  it("Admin tab has href /admin", async () => {
    mockGetMe.mockResolvedValue({ hasGeminiKey: true, role: "admin", approved: true });
    await renderHome();
    await waitFor(() => {
      expect(screen.queryByTestId("admin-tab")).toBeInTheDocument();
    });
    expect(screen.getByTestId("admin-tab")).toHaveAttribute("href", "/admin");
  });
});

describe("Bookshelf — dashboard (UX-008)", () => {
  const RECENT_BOOKS = [
    { id: 1, title: "Moby Dick", authors: ["Melville"], languages: ["en"], lastChapter: 2, lastRead: Date.now() - 60000 },
    { id: 2, title: "Hamlet", authors: ["Shakespeare"], languages: ["en"], lastChapter: 0, lastRead: Date.now() - 3600000 },
  ];

  beforeEach(() => {
    mockGetRecentBooks.mockReturnValue(RECENT_BOOKS);
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok", backendUser: { id: 1, name: "Alice Smith", picture: "" } },
      status: "authenticated",
    });
    mockGetReadingProgress.mockResolvedValue([]);
  });

  it("shows personalized greeting with first name", async () => {
    await renderBookshelf();
    expect(screen.getByText(/Welcome back, Alice/i)).toBeInTheDocument();
  });

  it("shows Continue Reading card for most recent book", async () => {
    await renderBookshelf();
    expect(screen.getByText("Continue Reading")).toBeInTheDocument();
    // Moby Dick is recentBooks[0] — appears in both the Continue Reading card and the grid
    expect(screen.getAllByText("Moby Dick").length).toBeGreaterThan(1);
  });

  it("Continue Reading card is a link to the reader", async () => {
    await renderBookshelf();
    // The Continue Reading card is now a <Link href="/reader/1">
    const continueLink = screen.getByRole("link", { name: /Continue reading/i });
    expect(continueLink).toHaveAttribute("href", "/reader/1");
  });

  it("shows stats strip with user progress when stats loaded", async () => {
    mockGetUserStats.mockResolvedValue({
      streak: 5,
      longest_streak: 10,
      totals: { books_started: 3, vocabulary_words: 42, annotations: 7, insights: 2 },
      activity: [],
    });
    await renderBookshelf();
    await waitFor(() => expect(screen.getByText("Your Progress")).toBeInTheDocument());
    expect(screen.getByText("5")).toBeInTheDocument(); // streak count
    expect(screen.getByText("3")).toBeInTheDocument(); // books started
  });

  it("'Show activity' toggle reveals and hides the heatmap", async () => {
    await renderBookshelf();
    await waitFor(() => expect(screen.getByText("Your Progress")).toBeInTheDocument());
    const toggle = screen.getByRole("button", { name: /Show activity/i });
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Hide activity/i })).toBeInTheDocument();
  });

  it("nav offers Home and Your Bookshelf, never 'Your Library'", async () => {
    await renderBookshelf();
    const labels = screen.getAllByRole("link").map((l) => l.textContent?.trim());
    expect(labels).toContain("Home");
    expect(labels).toContain("Your Bookshelf");
    expect(labels).not.toContain("Your Library");
  });
});

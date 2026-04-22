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
const mockGetPopularBooks = jest.fn();
const mockGetMe = jest.fn();
const mockSearchBooks = jest.fn();
const mockGetReadingProgress = jest.fn();
const mockGetUserStats = jest.fn();

jest.mock("@/lib/api", () => ({
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
  mockGetUserStats.mockResolvedValue({ streak: 0, longest_streak: 0, totals: { books_started: 0, vocabulary_words: 0, annotations: 0, insights: 0 }, activity: [] });
  mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
});

// ─── Render helper ────────────────────────────────────────────────────────────
async function renderHome() {
  render(<Home />);
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

  it("shows Sign in button when unauthenticated", async () => {
    await renderHome();
    expect(screen.getByRole("button", { name: /Sign in/i })).toBeInTheDocument();
  });

  it("navigates to /login when Sign in is clicked", async () => {
    const user = userEvent.setup();
    await renderHome();
    await user.click(screen.getByRole("button", { name: /Sign in/i }));
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("shows Discover tab by default when library is empty", async () => {
    await renderHome();
    expect(screen.getByRole("button", { name: /Discover/i })).toBeInTheDocument();
  });

  it("renders Library and Discover tab buttons", async () => {
    await renderHome();
    expect(screen.getByRole("button", { name: /Home/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Discover/i })).toBeInTheDocument();
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

  it("shows profile button instead of Sign in", async () => {
    await renderHome();
    expect(screen.queryByRole("button", { name: /Sign in/i })).not.toBeInTheDocument();
  });

  it("shows profile initial when no picture", async () => {
    await renderHome();
    // Profile button shows first letter of name
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("navigates to /profile when profile button is clicked", async () => {
    const user = userEvent.setup();
    await renderHome();
    const profileBtn = screen.getByTitle("Alice");
    await user.click(profileBtn);
    expect(mockPush).toHaveBeenCalledWith("/profile");
  });

  it("shows 'Your Notes' tab when authenticated", async () => {
    await renderHome();
    expect(screen.getByRole("button", { name: "Your Notes" })).toBeInTheDocument();
  });

  it("shows 'Your Word List' tab when authenticated", async () => {
    await renderHome();
    expect(screen.getByRole("button", { name: "Your Word List" })).toBeInTheDocument();
  });

  it("navigates to /vocabulary when 'Your Word List' is clicked", async () => {
    const user = userEvent.setup();
    await renderHome();
    await user.click(screen.getByRole("button", { name: "Your Word List" }));
    expect(mockPush).toHaveBeenCalledWith("/vocabulary");
  });

  it("calls getMe and getReadingProgress on mount", async () => {
    await renderHome();
    await waitFor(() => expect(mockGetMe).toHaveBeenCalled());
    await waitFor(() => expect(mockGetReadingProgress).toHaveBeenCalled());
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

  it("clicking Admin tab navigates to /admin", async () => {
    mockGetMe.mockResolvedValue({ hasGeminiKey: true, role: "admin", approved: true });
    const user = userEvent.setup();
    await renderHome();
    await waitFor(() => {
      expect(screen.queryByTestId("admin-tab")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("admin-tab"));
    expect(mockPush).toHaveBeenCalledWith("/admin");
  });
});

describe("HomePage — Library tab with books", () => {
  const RECENT_BOOKS = [
    { id: 1, title: "Moby Dick", authors: ["Melville"], languages: ["en"], lastChapter: 2, lastRead: Date.now() - 60000 },
    { id: 2, title: "Hamlet", authors: ["Shakespeare"], languages: ["en"], lastChapter: 0, lastRead: Date.now() - 3600000 },
  ];

  beforeEach(() => {
    mockGetRecentBooks.mockReturnValue(RECENT_BOOKS);
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" } },
      status: "authenticated",
    });
    mockGetReadingProgress.mockResolvedValue([]);
  });

  it("shows library books when recent books exist", async () => {
    await renderHome();
    // Moby Dick appears in Continue Reading card + grid; Hamlet appears in grid only
    expect(screen.getAllByText("Moby Dick").length).toBeGreaterThan(0);
    expect(screen.getByText("Hamlet")).toBeInTheDocument();
  });

  it("shows Library tab active when recent books exist", async () => {
    await renderHome();
    // Library tab is active by default when books exist
    expect(screen.getAllByText("Moby Dick").length).toBeGreaterThan(0);
  });

  it("shows book count badge in Library tab", async () => {
    await renderHome();
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("clicking a book card opens BookDetailModal", async () => {
    const user = userEvent.setup();
    await renderHome();
    // Use Hamlet (grid-only, single occurrence) to avoid the Continue Reading card
    await user.click(screen.getByText("Hamlet"));
    expect(await screen.findByTestId("book-detail-modal")).toBeInTheDocument();
  });

  it("closing BookDetailModal removes it", async () => {
    const user = userEvent.setup();
    await renderHome();
    await user.click(screen.getByText("Hamlet"));
    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("book-detail-modal")).not.toBeInTheDocument();
  });

  it("clicking Read in modal navigates to reader (book in library)", async () => {
    const user = userEvent.setup();
    await renderHome();
    await user.click(screen.getByText("Hamlet"));
    await user.click(await screen.findByRole("button", { name: "Read" }));
    expect(mockPush).toHaveBeenCalledWith("/reader/2");
  });

  it("shows 'Your library is empty' message when no recent books", async () => {
    mockGetRecentBooks.mockReturnValue([]);
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" } },
      status: "authenticated",
    });
    render(<Home />);
    await act(flushPromises);
    // Tab should switch to discover automatically, but manual click to Library shows empty
    // Switch to library tab
    await userEvent.click(screen.getByRole("button", { name: /Home/i }));
    expect(screen.getByText("Your library is empty")).toBeInTheDocument();
  });

  it("'Discover Books' button switches to discover tab from empty library", async () => {
    mockGetRecentBooks.mockReturnValue([]);
    mockUseSession.mockReturnValue({
      data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" } },
      status: "authenticated",
    });
    const user = userEvent.setup();
    render(<Home />);
    await act(flushPromises);
    await user.click(screen.getByRole("button", { name: /Home/i }));
    await user.click(screen.getByRole("button", { name: "Discover Books" }));
    expect(screen.getByRole("button", { name: /Search/i })).toBeInTheDocument();
  });
});

describe("HomePage — Discover tab", () => {
  it("shows Search heading in Discover tab", async () => {
    await renderHome();
    expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
  });

  it("shows Popular Classics section", async () => {
    await renderHome();
    expect(screen.getByText("Popular Classics")).toBeInTheDocument();
  });

  it("shows popular books after loading", async () => {
    mockGetPopularBooks.mockResolvedValue(makePopularResponse([makeBook(1, "Crime and Punishment")]));
    await renderHome();
    await waitFor(() => {
      // There may be a featured pill AND a book card with the same title — use getAllByText
      const matches = screen.getAllByText("Crime and Punishment");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows loading skeletons while popular books are loading", async () => {
    let resolve: (v: unknown) => void;
    mockGetPopularBooks.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<Home />);
    // Give the first effect a tick
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
    // cleanup
    resolve!(makePopularResponse());
  });

  it("shows 'No popular books available yet.' when list is empty", async () => {
    mockGetPopularBooks.mockResolvedValue({ books: [], total: 0, page: 1, per_page: 50 });
    await renderHome();
    await waitFor(() => {
      expect(screen.getByText("No popular books available yet.")).toBeInTheDocument();
    });
  });

  it("clicking a popular book opens BookDetailModal", async () => {
    const user = userEvent.setup();
    mockGetPopularBooks.mockResolvedValue(makePopularResponse([makeBook(99, "Faust")]));
    await renderHome();
    await waitFor(() => expect(screen.queryByTestId("book-card-99")).toBeInTheDocument());
    // Click the BookCard button (not the featured pill)
    const card = screen.getByTestId("book-card-99");
    await user.click(card.querySelector("button")!);
    expect(await screen.findByTestId("book-detail-modal")).toBeInTheDocument();
    expect(screen.getByTestId("book-detail-modal")).toHaveTextContent("Faust");
  });

  it("navigates to import page for books not in library", async () => {
    const user = userEvent.setup();
    mockGetPopularBooks.mockResolvedValue(makePopularResponse([makeBook(999, "Odyssey")]));
    await renderHome();
    await waitFor(() => screen.getByText("Odyssey"));
    await user.click(screen.getByText("Odyssey"));
    await user.click(await screen.findByRole("button", { name: "Read" }));
    expect(mockPush).toHaveBeenCalledWith("/import/999?next=/reader/999");
  });
});

describe("HomePage — Search functionality", () => {
  it("search input accepts text", async () => {
    const user = userEvent.setup();
    await renderHome();
    const input = screen.getByPlaceholderText(/Search by title or author/i);
    await user.type(input, "Hamlet");
    expect(input).toHaveValue("Hamlet");
  });

  it("pressing Enter in search input triggers search", async () => {
    const user = userEvent.setup();
    mockSearchBooks.mockResolvedValue({ books: [makeBook(42, "Hamlet")] });
    await renderHome();
    const input = screen.getByPlaceholderText(/Search by title or author/i);
    await user.type(input, "Hamlet");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mockSearchBooks).toHaveBeenCalledWith("Hamlet", ""));
  });

  it("clicking Search button triggers search", async () => {
    const user = userEvent.setup();
    mockSearchBooks.mockResolvedValue({ books: [makeBook(42, "Hamlet")] });
    await renderHome();
    const input = screen.getByPlaceholderText(/Search by title or author/i);
    await user.type(input, "Hamlet");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(mockSearchBooks).toHaveBeenCalled());
  });

  it("shows search results after successful search", async () => {
    const user = userEvent.setup();
    mockSearchBooks.mockResolvedValue({ books: [makeBook(42, "Hamlet")] });
    await renderHome();
    const input = screen.getByPlaceholderText(/Search by title or author/i);
    await user.type(input, "Hamlet");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      // Hamlet may appear as featured pill + search result card
      expect(screen.queryByTestId("book-card-42")).toBeInTheDocument();
    });
  });

  it("shows 'No books found' when search returns empty", async () => {
    const user = userEvent.setup();
    mockSearchBooks.mockResolvedValue({ books: [] });
    await renderHome();
    const input = screen.getByPlaceholderText(/Search by title or author/i);
    await user.type(input, "xyzzy123");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      expect(screen.getByText(/No books found for/i)).toBeInTheDocument();
    });
  });

  it("shows error message when search fails", async () => {
    const user = userEvent.setup();
    mockSearchBooks.mockRejectedValue(new Error("Network error"));
    await renderHome();
    const input = screen.getByPlaceholderText(/Search by title or author/i);
    await user.type(input, "Hamlet");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("shows loading state during search", async () => {
    const user = userEvent.setup();
    let resolve: (v: unknown) => void;
    mockSearchBooks.mockReturnValue(new Promise((r) => { resolve = r; }));
    await renderHome();
    const input = screen.getByPlaceholderText(/Search by title or author/i);
    await user.type(input, "Hamlet");
    await user.click(screen.getByRole("button", { name: "Search" }));
    // Searching state
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Searching/i })).toBeInTheDocument();
    });
    resolve!({ books: [] });
  });

  it("clicking a featured pill sets query and triggers search", async () => {
    const user = userEvent.setup();
    mockSearchBooks.mockResolvedValue({ books: [] });
    await renderHome();
    const faustPill = screen.getByRole("button", { name: "Faust" });
    await user.click(faustPill);
    await waitFor(() => {
      expect(mockSearchBooks).toHaveBeenCalledWith("Faust", "de");
    });
  });

  it("does not search when query is empty", async () => {
    const user = userEvent.setup();
    await renderHome();
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(mockSearchBooks).not.toHaveBeenCalled();
  });
});

describe("HomePage — tab switching", () => {
  it("clicking Discover tab shows discover content", async () => {
    mockGetRecentBooks.mockReturnValue([makeBook(1, "Moby Dick") as unknown as ReturnType<typeof mockGetRecentBooks>]);
    const user = userEvent.setup();
    render(<Home />);
    await act(flushPromises);
    await user.click(screen.getByRole("button", { name: /Discover/i }));
    expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
  });

  it("clicking Library tab shows library content", async () => {
    const user = userEvent.setup();
    await renderHome();
    await user.click(screen.getByRole("button", { name: /Home/i }));
    // Library tab is now active; heading or empty state visible
    expect(
      screen.getByText("Your library is empty") ||
      screen.queryByText(/Home/i)
    ).toBeTruthy();
  });
});

describe("HomePage — unauthenticated always sees discover", () => {
  it("starts on Discover tab when unauthenticated (no recent books)", async () => {
    await renderHome();
    // Search section should be visible (discover tab is active)
    expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
  });
});

describe("HomePage — Home dashboard (UX-008)", () => {
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
    await renderHome();
    expect(screen.getByText(/Welcome back, Alice/i)).toBeInTheDocument();
  });

  it("shows Continue Reading card for most recent book", async () => {
    await renderHome();
    expect(screen.getByText("Continue Reading")).toBeInTheDocument();
    // Moby Dick is recentBooks[0] — appears in both the Continue Reading card and the grid
    expect(screen.getAllByText("Moby Dick").length).toBeGreaterThan(1);
  });

  it("clicking Continue Reading card navigates directly to reader", async () => {
    const user = userEvent.setup();
    await renderHome();
    // The Continue Reading button is the first interactive element with the book title
    const continueBtn = screen.getByRole("button", { name: /Continue Reading/i });
    await user.click(continueBtn);
    expect(mockPush).toHaveBeenCalledWith("/reader/1");
  });

  it("shows stats strip with user progress when stats loaded", async () => {
    mockGetUserStats.mockResolvedValue({
      streak: 5,
      longest_streak: 10,
      totals: { books_started: 3, vocabulary_words: 42, annotations: 7, insights: 2 },
      activity: [],
    });
    await renderHome();
    await waitFor(() => expect(screen.getByText("Your Progress")).toBeInTheDocument());
    expect(screen.getByText("5")).toBeInTheDocument(); // streak count
    expect(screen.getByText("3")).toBeInTheDocument(); // books started
  });

  it("'Show activity' toggle reveals and hides the heatmap", async () => {
    await renderHome();
    await waitFor(() => expect(screen.getByText("Your Progress")).toBeInTheDocument());
    const toggle = screen.getByRole("button", { name: /Show activity/i });
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Hide activity/i })).toBeInTheDocument();
  });

  it("tab is labelled Home not Your Library", async () => {
    await renderHome();
    expect(screen.getByRole("button", { name: /^Home/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Your Library/i })).not.toBeInTheDocument();
  });
});

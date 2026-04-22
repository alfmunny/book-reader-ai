/**
 * HomePage — additional branch coverage:
 *  Line 483[1]: book.download_count <= 0 → null branch in list view
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
}));

const mockGetRecentBooks = jest.fn();
const mockRemoveRecentBook = jest.fn();

jest.mock("@/lib/recentBooks", () => ({
  getRecentBooks: (...args: unknown[]) => mockGetRecentBooks(...args),
  removeRecentBook: (...args: unknown[]) => mockRemoveRecentBook(...args),
}));

jest.mock("@/components/BookCard", () => {
  const BookCard = ({ book, onClick }: { book: { id: number; title: string }; onClick?: () => void }) => (
    <div data-testid={`book-card-${book.id}`}>
      <button onClick={onClick}>{book.title}</button>
    </div>
  );
  BookCard.displayName = "BookCard";
  return { __esModule: true, default: BookCard };
});

jest.mock("@/components/BookDetailModal", () => {
  const BookDetailModal = ({ onClose }: { onClose: () => void }) => (
    <div data-testid="book-detail-modal">
      <button onClick={onClose}>Close</button>
    </div>
  );
  BookDetailModal.displayName = "BookDetailModal";
  return { __esModule: true, default: BookDetailModal };
});

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
  mockSearchBooks.mockResolvedValue({ books: [] });
  mockGetReadingProgress.mockResolvedValue([]);
  mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
});

// ── Line 483[1]: download_count <= 0 → null branch ───────────────────────────

describe("HomePage — list view download_count=0 → null branch (line 483[1])", () => {
  it("renders no download count span when book has download_count=0 in list view", async () => {
    const bookNoCount = {
      id: 999,
      title: "Free Book",
      authors: ["Free Author"],
      languages: ["en"],
      subjects: [],
      download_count: 0,
      cover: "",
    };
    mockGetPopularBooks.mockResolvedValue({ books: [bookNoCount], total: 1, page: 1, per_page: 50 });

    render(<Home />);
    await act(flushPromises);
    await act(flushPromises);

    // Switch to list view
    const listViewBtn = screen.getByTitle("List view");
    await userEvent.click(listViewBtn);

    await waitFor(() => screen.getByText("Free Book"));
    // download_count=0 → ternary false branch → no count span rendered
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

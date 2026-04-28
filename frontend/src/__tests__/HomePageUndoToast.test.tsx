/**
 * Regression tests for #2007 — UndoToast onUndo/onDone callbacks in app/page.tsx
 * are uncovered (lines 833-838).
 *
 *   - onUndo  (line 833): called when user clicks "Undo" in the remove-book toast.
 *             Should call recordRecentBook + setRecentBooks.
 *   - onDone  (line 838): called when toast auto-expires (3 s + 300 ms fade).
 *             Should clear removedBookToast state so toast disappears.
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
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// ─── @/lib/api ───────────────────────────────────────────────────────────────
jest.mock("@/lib/api", () => ({
  getPopularBooks: () => Promise.resolve({ books: [], total: 0, page: 1, per_page: 50 }),
  getMe: () => Promise.resolve({ hasGeminiKey: false, role: "user", approved: true }),
  searchBooks: () => Promise.resolve({ books: [] }),
  getReadingProgress: () => Promise.resolve([]),
  getUserStats: () => Promise.resolve({
    streak: 0, longest_streak: 0,
    totals: { books_started: 0, vocabulary_words: 0, annotations: 0, insights: 0 },
    activity: [],
  }),
}));

// ─── @/lib/recentBooks ───────────────────────────────────────────────────────
const mockGetRecentBooks = jest.fn();
const mockRemoveRecentBook = jest.fn();
const mockRecordRecentBook = jest.fn();

jest.mock("@/lib/recentBooks", () => ({
  getRecentBooks: (...args: unknown[]) => mockGetRecentBooks(...args),
  removeRecentBook: (...args: unknown[]) => mockRemoveRecentBook(...args),
  recordRecentBook: (...args: unknown[]) => mockRecordRecentBook(...args),
}));

// ─── UndoToast mock — captures callbacks so tests can invoke them directly ───
let capturedOnUndo: (() => void) | undefined;
let capturedOnDone: (() => void) | undefined;

jest.mock("@/components/UndoToast", () => ({
  __esModule: true,
  default: ({ onUndo, onDone }: { message: string; onUndo: () => void; onDone: () => void }) => {
    capturedOnUndo = onUndo;
    capturedOnDone = onDone;
    return (
      <div role="status">
        <button onClick={onUndo}>Undo</button>
      </div>
    );
  },
}));

// ─── BookCard mock — exposes onRemove as a button ────────────────────────────
jest.mock("@/components/BookCard", () => {
  const BookCard = ({ book, onClick, onRemove }: {
    book: { id: number; title: string; authors: string[] };
    onClick?: () => void;
    onRemove?: () => void;
  }) => (
    <div data-testid={`book-card-${book.id}`}>
      <button onClick={onClick}>{book.title}</button>
      {onRemove && (
        <button onClick={onRemove} aria-label={`remove-${book.title}`}>Remove</button>
      )}
    </div>
  );
  BookCard.displayName = "BookCard";
  return { __esModule: true, default: BookCard };
});

jest.mock("@/components/BookDetailModal", () => {
  return { __esModule: true, default: () => null };
});

// ─── Fixture ──────────────────────────────────────────────────────────────────
const RECENT_BOOK = {
  id: 42,
  title: "Great Expectations",
  authors: ["Charles Dickens"],
  languages: ["en"],
  subjects: [],
  download_count: 500,
  cover: null,
  lastChapter: 0,
  lastRead: Date.now() - 5000,
};

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

let Home: React.ComponentType;
beforeAll(async () => {
  const mod = await import("@/app/page");
  Home = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
  capturedOnUndo = undefined;
  capturedOnDone = undefined;
  mockGetRecentBooks.mockReturnValue([RECENT_BOOK]);
  mockUseSession.mockReturnValue({
    data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" } },
    status: "authenticated",
  });
});

// ── onUndo (line 833): clicking Undo restores the book ───────────────────────

test("onUndo calls recordRecentBook and refreshes list (line 833, #2007)", async () => {
  mockGetRecentBooks
    .mockReturnValueOnce([RECENT_BOOK])
    .mockReturnValue([]);

  const user = userEvent.setup();
  render(<Home />);
  await act(flushPromises);
  await act(flushPromises);

  // Click the remove button on the BookCard
  const removeBtn = screen.getByRole("button", { name: /remove-Great Expectations/i });
  await user.click(removeBtn);

  // UndoToast should be visible; onUndo callback should be captured
  expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
  expect(capturedOnUndo).toBeDefined();

  // Invoke onUndo directly (covers line 833)
  act(() => { capturedOnUndo!(); });

  expect(mockRecordRecentBook).toHaveBeenCalledWith(
    expect.objectContaining({ id: 42, title: "Great Expectations" }),
    expect.anything(),
  );
});

// ── onDone (line 838): toast expiry clears state ─────────────────────────────

test("onDone clears removedBookToast state (line 838, #2007)", async () => {
  mockGetRecentBooks
    .mockReturnValueOnce([RECENT_BOOK])
    .mockReturnValue([]);

  const user = userEvent.setup();
  render(<Home />);
  await act(flushPromises);
  await act(flushPromises);

  // Trigger removal to show the toast
  const removeBtn = screen.getByRole("button", { name: /remove-Great Expectations/i });
  await user.click(removeBtn);

  // Toast is visible and onDone is captured
  expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
  expect(capturedOnDone).toBeDefined();

  // Invoke onDone directly (covers line 838: setRemovedBookToast(null))
  act(() => { capturedOnDone!(); });

  // onDone sets removedBookToast to null → UndoToast unmounts
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
  });
});

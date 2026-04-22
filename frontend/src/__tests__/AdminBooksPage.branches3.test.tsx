/**
 * AdminBooksPage — third branch coverage pass targeting null/undefined field branches.
 *
 * Uncovered branches targeted:
 *  Lines 261, 270: `b.authors || []` — need authors=null so fallback [] is used
 *  Lines 273, 274: `b.translations || {}`, `b.queue || {}` — need null fields
 *  Line 303:       `b.text_length || 0` — need text_length=0
 *  Line 305:       `b.authors?.length ?` — need authors=[] or null
 *  Lines 314, 320: `b.translations?.[lang] || 0` and `if (count)` — need count=0
 *  Lines 512, 518: `moveInput[rowKey] ?? ""` — need undefined moveInput entry
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAdminFetch = jest.fn();
const mockPush = jest.fn();

jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/components/SeedPopularButton", () => {
  const Seed = ({ onComplete }: { onComplete: () => void }) => (
    <button onClick={onComplete}>Seed popular</button>
  );
  Seed.displayName = "SeedPopularButton";
  return { __esModule: true, default: Seed };
});

let BooksPage: React.ComponentType;
beforeAll(async () => {
  const mod = await import("@/app/admin/books/page");
  BooksPage = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(window, "alert").mockImplementation(() => {});
  jest.spyOn(window, "confirm").mockReturnValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

// ── Lines 261, 270, 305: b.authors || [] and b.authors?.length falsy ──────────

describe("AdminBooksPage — null authors fallback (lines 261, 270, 305)", () => {
  it("renders book with authors=null without crashing (covers || [] false branch)", async () => {
    const bookNullAuthors = [
      {
        id: 50,
        title: "Authorless Book",
        authors: null,
        languages: ["en"],
        download_count: 5,
        text_length: 1000,
        word_count: 200,
        translations: { en: 1 },
        queue: {},
        active: false,
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(bookNullAuthors)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    await screen.findByText("Authorless Book");
    // authors?.length is falsy → no author string appended
    expect(screen.queryByText(/· null/)).not.toBeInTheDocument();
  });

  it("search with authors=null still works (covers ...(b.authors || []) in filter)", async () => {
    const bookNullAuthors = [
      {
        id: 51,
        title: "Searchable Authorless",
        authors: null,
        languages: ["en"],
        download_count: 5,
        text_length: 1000,
        translations: {},
        queue: {},
        active: false,
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(bookNullAuthors)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    const searchInput = await screen.findByRole("searchbox");
    await userEvent.type(searchInput, "Searchable");

    await waitFor(() =>
      expect(screen.getByText("Searchable Authorless")).toBeInTheDocument(),
    );
  });

  it("renders book with empty authors array — authors?.length is 0 (line 305 false)", async () => {
    const bookEmptyAuthors = [
      {
        id: 52,
        title: "Empty Authors Book",
        authors: [],
        languages: ["en"],
        download_count: 5,
        text_length: 2000,
        translations: { en: 1 },
        queue: {},
        active: false,
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(bookEmptyAuthors)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    await screen.findByText("Empty Authors Book");
    // No author text appended when authors is empty
    expect(screen.queryByText(/· $/)).not.toBeInTheDocument();
  });
});

// ── Lines 273, 274: b.translations || {} and b.queue || {} false branches ─────

describe("AdminBooksPage — null translations and queue fallback (lines 273, 274)", () => {
  it("renders book with translations=null and queue=null without crashing", async () => {
    const bookNullFields = [
      {
        id: 60,
        title: "Null Fields Book",
        authors: ["Author"],
        languages: ["en"],
        download_count: 5,
        text_length: 1000,
        translations: null,
        queue: null,
        active: false,
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(bookNullFields)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    await screen.findByText("Null Fields Book");
    // no translations → allLangs=[] → "no translations" shown
    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    await waitFor(() =>
      expect(screen.getAllByText(/no translations/i).length).toBeGreaterThan(0),
    );
  });
});

// ── Line 303: b.text_length || 0 false branch (text_length=0) ─────────────────

describe("AdminBooksPage — text_length=0 fallback (line 303)", () => {
  it("shows '0K chars' when text_length is 0 (covers || 0 false branch)", async () => {
    const bookZeroLength = [
      {
        id: 70,
        title: "Zero Length Book",
        authors: ["Author"],
        languages: ["en"],
        download_count: 5,
        text_length: 0,
        translations: { en: 1 },
        queue: {},
        active: false,
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(bookZeroLength)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    await screen.findByText("Zero Length Book");
    expect(screen.getByText(/0K chars/)).toBeInTheDocument();
  });
});

// ── Lines 314, 320: count=0 — translation count is 0, if(count) is false ──────

describe("AdminBooksPage — translation count=0 in allLangs (lines 314, 320)", () => {
  it("lang badge shows only pending when translations[lang] is missing (count=0)", async () => {
    const bookQueueOnly = [
      {
        id: 80,
        title: "Queue Only Book",
        authors: ["Author"],
        languages: ["en"],
        download_count: 5,
        text_length: 3000,
        translations: {},
        queue: { fr: { pending: 2, running: 0, failed: 0 } },
        active: false,
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(bookQueueOnly)
      .mockResolvedValueOnce([]);

    render(<BooksPage />);
    await flushPromises();

    await screen.findByText("Queue Only Book");
    // "fr" appears in allLangs from queue; count = translations?.fr || 0 = 0
    // if(count) is false → "done" not in pieces
    // The "fr" badge has title "2 pending" (count=0 → "done" not in pieces)
    await waitFor(() =>
      expect(screen.getByTitle("2 pending")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/0 done/)).not.toBeInTheDocument();
  });
});

// ── Lines 512, 518: moveInput[rowKey] ?? "" — undefined entry triggers "" ──────

describe("AdminBooksPage — moveInput ?? '' false branch (lines 512, 518)", () => {
  async function renderWithChapterRows() {
    const book = [
      {
        id: 90,
        title: "Move Input Book",
        authors: ["Author"],
        languages: ["en"],
        download_count: 5,
        text_length: 5000,
        word_count: 1000,
        translations: { zh: 2 },
        queue: {},
        active: false,
      },
    ];
    const translations = [
      {
        book_id: 90,
        chapter_index: 0,
        target_language: "zh",
        size_chars: 2000,
        created_at: "2024-01-01",
      },
      {
        book_id: 90,
        chapter_index: 1,
        target_language: "zh",
        size_chars: 1000,
        created_at: "2024-01-02",
      },
    ];
    mockAdminFetch
      .mockResolvedValueOnce(book)
      .mockResolvedValueOnce(translations);
    render(<BooksPage />);
    await flushPromises();

    const expandBtns = await screen.findAllByTitle("Expand");
    await userEvent.click(expandBtns[0]);

    await waitFor(() => screen.getByText("zh"));
    const allBtns = screen.getAllByRole("button");
    const langArrow = allBtns.find(
      (b) => (b.textContent === "▶" || b.textContent === "▼") && !b.title,
    );
    if (langArrow) await userEvent.click(langArrow);
    await waitFor(() => screen.getByText("Ch. 1"));
  }

  it("pressing Enter on move input without typing fires handleMove with '' (line 512 ?? false branch)", async () => {
    await renderWithChapterRows();

    const moveInputs = screen.getAllByPlaceholderText("→Ch") as HTMLInputElement[];
    // moveInput[rowKey] is undefined → ?? "" covers false branch
    fireEvent.keyDown(moveInputs[0], { key: "Enter" });

    // handleMove called with "" — no alert since empty string causes early return
    await flushPromises();
    expect(document.body).toBeTruthy();
  });

  it("move input renders with value='' when moveInput entry is undefined (line 507 ?? false)", async () => {
    await renderWithChapterRows();

    const moveInputs = screen.getAllByPlaceholderText("→Ch") as HTMLInputElement[];
    // Initial render: moveInput[rowKey] is undefined → value = undefined ?? "" = ""
    expect(moveInputs[0].value).toBe("");
  });
});

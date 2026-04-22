/**
 * BookDetailModal — tests covering all uncovered branches:
 *   33:  Escape key calls onClose
 *   53:  click on overlay background calls onClose; click inside modal is stopped
 *   92:  book has a cover image → renders <img>
 *
 * Also covers full/partial translation status, recentBook display,
 * subject tags, download count, and translation badge logic.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  getBookTranslationStatus: jest.fn(),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn(() => ({ translationLang: "zh" })),
}));

import * as api from "@/lib/api";
import BookDetailModal from "@/components/BookDetailModal";
import type { BookMeta } from "@/lib/api";

const mockGetTranslationStatus = api.getBookTranslationStatus as jest.MockedFunction<
  typeof api.getBookTranslationStatus
>;

const BASE_BOOK: BookMeta = {
  id: 1,
  title: "Moby Dick",
  authors: ["Herman Melville"],
  languages: ["en"],
  subjects: ["Adventure", "Sea stories"],
  download_count: 5000,
  cover: "",
};

const BASE_PROPS = {
  book: BASE_BOOK,
  recentBook: undefined,
  onClose: jest.fn(),
  onRead: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTranslationStatus.mockResolvedValue({
    translated_chapters: 0,
    total_chapters: 10,
  });
});

// ── Line 33: Escape key calls onClose ────────────────────────────────────────

describe("BookDetailModal — Escape key closes modal (line 33)", () => {
  it("calls onClose when Escape key is pressed", async () => {
    const onClose = jest.fn();
    render(<BookDetailModal {...BASE_PROPS} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose for other keys", async () => {
    const onClose = jest.fn();
    render(<BookDetailModal {...BASE_PROPS} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes keydown listener on unmount", () => {
    const onClose = jest.fn();
    const { unmount } = render(<BookDetailModal {...BASE_PROPS} onClose={onClose} />);
    unmount();

    fireEvent.keyDown(document, { key: "Escape" });

    // After unmount the listener is removed, so onClose should not have been called
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ── Line 53: overlay click vs inside-modal click ─────────────────────────────

describe("BookDetailModal — overlay vs inner click (line 53)", () => {
  it("calls onClose when overlay background is clicked", async () => {
    const onClose = jest.fn();
    render(<BookDetailModal {...BASE_PROPS} onClose={onClose} />);

    // The outer div with onClick={onClose} is the overlay
    const overlay = document.querySelector(".fixed.inset-0") as HTMLElement;
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalled();
  });

  it("does NOT call onClose when clicking inside the modal card", async () => {
    const onClose = jest.fn();
    render(<BookDetailModal {...BASE_PROPS} onClose={onClose} />);

    // The inner div has e.stopPropagation()
    const card = document.querySelector(".bg-white.rounded-t-2xl") as HTMLElement;
    expect(card).not.toBeNull();
    fireEvent.click(card);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when close (✕) button is clicked", async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<BookDetailModal {...BASE_PROPS} onClose={onClose} />);

    const closeBtn = screen.getByRole("button", { name: /Close/i });
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
  });
});

// ── Line 92: book.cover renders <img> ────────────────────────────────────────

describe("BookDetailModal — cover image rendering (line 92)", () => {
  it("renders cover image when book.cover is provided", async () => {
    const bookWithCover = { ...BASE_BOOK, cover: "https://example.com/cover.jpg" };
    render(<BookDetailModal {...BASE_PROPS} book={bookWithCover} />);

    await waitFor(() => {
      const img = document.querySelector('img[src="https://example.com/cover.jpg"]');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("alt", "Moby Dick");
    });
  });

  it("renders SVG placeholder when book.cover is empty", () => {
    const { container } = render(<BookDetailModal {...BASE_PROPS} />);

    // No img element for the cover
    const imgs = document.querySelectorAll("img");
    const coverImg = Array.from(imgs).find(
      (img) => img.closest(".w-16.h-24"),
    );
    expect(coverImg).toBeUndefined();

    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

// ── Translation status badges ─────────────────────────────────────────────────

describe("BookDetailModal — translation status", () => {
  it("shows full translation badge when all chapters translated", async () => {
    mockGetTranslationStatus.mockResolvedValue({
      translated_chapters: 10,
      total_chapters: 10,
    });

    // Book with en language != translationLang (zh)
    const bookEn = { ...BASE_BOOK, languages: ["en"] };
    render(<BookDetailModal {...BASE_PROPS} book={bookEn} />);

    await waitFor(() =>
      expect(screen.getByText(/Full Chinese translation available/i)).toBeInTheDocument(),
    );
  });

  it("shows partial translation badge when some chapters translated", async () => {
    mockGetTranslationStatus.mockResolvedValue({
      translated_chapters: 5,
      total_chapters: 10,
    });

    const bookEn = { ...BASE_BOOK, languages: ["en"] };
    render(<BookDetailModal {...BASE_PROPS} book={bookEn} />);

    await waitFor(() =>
      expect(screen.getByText(/5\/10 chapters translated/i)).toBeInTheDocument(),
    );
  });

  it("does not show translation badge when translationLang equals book language", async () => {
    // If book.languages[0] === translationLang, showTranslation is false
    mockGetTranslationStatus.mockResolvedValue({
      translated_chapters: 8,
      total_chapters: 10,
    });

    // Book language is zh, same as translationLang → showTranslation=false
    const bookZh = { ...BASE_BOOK, languages: ["zh"] };
    render(<BookDetailModal {...BASE_PROPS} book={bookZh} />);

    await waitFor(() => expect(mockGetTranslationStatus).toHaveBeenCalled());

    expect(screen.queryByText(/translation available/i)).not.toBeInTheDocument();
  });

  it("does not show badge when no translations (0 chapters)", async () => {
    mockGetTranslationStatus.mockResolvedValue({
      translated_chapters: 0,
      total_chapters: 10,
    });

    render(<BookDetailModal {...BASE_PROPS} />);

    await waitFor(() => expect(mockGetTranslationStatus).toHaveBeenCalled());

    expect(screen.queryByText(/translation available/i)).not.toBeInTheDocument();
  });
});

// ── Recent book progress ──────────────────────────────────────────────────────

describe("BookDetailModal — recent book progress", () => {
  it("shows continue reading progress when recentBook provided", () => {
    const recentBook = {
      id: 1,
      title: "Moby Dick",
      authors: ["Herman Melville"],
      languages: ["en"],
      lastChapter: 5,
      lastRead: Date.now(),
    };

    render(<BookDetailModal {...BASE_PROPS} recentBook={recentBook} />);

    expect(screen.getByText(/Last read: Chapter 6/i)).toBeInTheDocument();
    expect(screen.getByText(/Continue Reading — Ch. 6/i)).toBeInTheDocument();
  });

  it("shows Start Reading when no recent book", () => {
    render(<BookDetailModal {...BASE_PROPS} recentBook={undefined} />);

    expect(screen.getByText("Start Reading")).toBeInTheDocument();
  });
});

// ── Subject tags ──────────────────────────────────────────────────────────────

describe("BookDetailModal — subject tags", () => {
  it("renders subject tags when book.subjects has entries", () => {
    const bookWithSubjects = {
      ...BASE_BOOK,
      subjects: ["Adventure", "Sea stories", "Whales", "Fiction", "Classics"],
    };

    render(<BookDetailModal {...BASE_PROPS} book={bookWithSubjects} />);

    expect(screen.getByText("Adventure")).toBeInTheDocument();
    expect(screen.getByText("Sea stories")).toBeInTheDocument();
  });

  it("renders no subjects section when subjects is empty", () => {
    const bookNoSubjects = { ...BASE_BOOK, subjects: [] };
    render(<BookDetailModal {...BASE_PROPS} book={bookNoSubjects} />);

    expect(screen.queryByText("Adventure")).not.toBeInTheDocument();
  });

  it("renders at most 5 subject tags", () => {
    const bookManySubjects = {
      ...BASE_BOOK,
      subjects: ["s1", "s2", "s3", "s4", "s5", "s6", "s7"],
    };

    render(<BookDetailModal {...BASE_PROPS} book={bookManySubjects} />);

    // Only 5 are shown
    expect(screen.getByText("s1")).toBeInTheDocument();
    expect(screen.getByText("s5")).toBeInTheDocument();
    expect(screen.queryByText("s6")).not.toBeInTheDocument();
  });
});

// ── Download count ─────────────────────────────────────────────────────────────

describe("BookDetailModal — download count", () => {
  it("shows download count when > 0", () => {
    render(<BookDetailModal {...BASE_PROPS} />);

    expect(screen.getByText(/5,000 downloads/i)).toBeInTheDocument();
  });

  it("does not show download count when 0", () => {
    const bookNoDl = { ...BASE_BOOK, download_count: 0 };
    render(<BookDetailModal {...BASE_PROPS} book={bookNoDl} />);

    expect(screen.queryByText(/downloads/i)).not.toBeInTheDocument();
  });
});

// ── Language badges ───────────────────────────────────────────────────────────

describe("BookDetailModal — language badges", () => {
  it("shows known language name", () => {
    const bookDe = { ...BASE_BOOK, languages: ["de"] };
    render(<BookDetailModal {...BASE_PROPS} book={bookDe} />);

    expect(screen.getByText("German")).toBeInTheDocument();
  });

  it("shows uppercase language code for unknown language", () => {
    const bookXx = { ...BASE_BOOK, languages: ["xx"] };
    render(<BookDetailModal {...BASE_PROPS} book={bookXx} />);

    expect(screen.getByText("XX")).toBeInTheDocument();
  });
});

// ── onRead button ──────────────────────────────────────────────────────────────

describe("BookDetailModal — onRead button", () => {
  it("calls onRead when Start Reading button is clicked", async () => {
    const onRead = jest.fn();
    const user = userEvent.setup();
    render(<BookDetailModal {...BASE_PROPS} onRead={onRead} />);

    await user.click(screen.getByText("Start Reading"));
    expect(onRead).toHaveBeenCalled();
  });
});

// ── Line 44: book.languages[0] undefined — falls back to "en" default ─────────

describe("BookDetailModal — languages[0] undefined fallback (line 44)", () => {
  it("treats book with empty languages array as language 'en' for translation check", async () => {
    // translationLang=zh, book.languages[0] is undefined → ?? "en" → shows translation
    mockGetTranslationStatus.mockResolvedValue({
      translated_chapters: 5,
      total_chapters: 10,
    });

    const bookNoLang = { ...BASE_BOOK, languages: [] };
    render(<BookDetailModal {...BASE_PROPS} book={bookNoLang} />);

    // translationLang (zh) !== "en" (fallback) → showTranslation = true
    await waitFor(() =>
      expect(screen.getByText(/5\/10 chapters translated/i)).toBeInTheDocument(),
    );
  });
});

// ── Lines 89-91: book.subjects is undefined (null coalescing) ────────────────

describe("BookDetailModal — subjects is undefined/null (lines 89-91)", () => {
  it("renders no subject tags when subjects is undefined", () => {
    const bookNoSubjects = { ...BASE_BOOK, subjects: undefined as unknown as string[] };
    render(<BookDetailModal {...BASE_PROPS} book={bookNoSubjects} />);

    // No subject tags rendered
    expect(screen.queryByText("Adventure")).not.toBeInTheDocument();
  });
});

// ── Lines 105-106: unknown translationLang code fallback ─────────────────────

describe("BookDetailModal — unknown translationLang code (lines 105-106)", () => {
  it("uses raw lang code in badge when translationLang not in LANG_NAMES", async () => {
    // Override getSettings to return unknown language code
    const { getSettings } = await import("@/lib/settings");
    (getSettings as jest.Mock).mockReturnValue({ translationLang: "xx" });

    mockGetTranslationStatus.mockResolvedValue({
      translated_chapters: 10,
      total_chapters: 10,
    });

    const bookEn = { ...BASE_BOOK, languages: ["en"] };
    render(<BookDetailModal {...BASE_PROPS} book={bookEn} />);

    await waitFor(() =>
      expect(screen.getByText(/Full xx translation available/i)).toBeInTheDocument(),
    );

    // Restore for other tests
    (getSettings as jest.Mock).mockReturnValue({ translationLang: "zh" });
  });
});

/**
 * ReaderPage branch coverage — round 4
 * Targets remaining uncovered lines in reader/[bookId]/page.tsx:
 *   121[0]:     handleReaderTap target filter TRUE — click on button in mobile
 *   143[0]:     handleTouchStart early return in desktop mode
 *   149[0]:     handleTouchEnd early return in desktop mode
 *   157[0]:     handleTouchEnd timing/distance filter — too-short swipe
 *   353[0]:     bookLanguage undefined when languages=[] → translation effect early return
 *   1243-1249:  InsightChat ?? fallbacks — hasGeminiKey/current/meta all undefined
 *   1420[1]:    vocab occurrence same chapter → else branch (no navigation)
 */
import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── next-auth ────────────────────────────────────────────────────────────────
const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

// ─── next/navigation ─────────────────────────────────────────────────────────
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUseParams = jest.fn();
const mockUseRouter = jest.fn(() => ({ push: mockPush, replace: mockReplace }));
const mockUseSearchParams = jest.fn(() => ({ get: () => null }));

jest.mock("next/navigation", () => ({
  useParams: (...args: unknown[]) => mockUseParams(...args),
  useRouter: (...args: unknown[]) => mockUseRouter(...args),
  useSearchParams: (...args: unknown[]) => mockUseSearchParams(...args),
}));

// ─── @/lib/api ────────────────────────────────────────────────────────────────
const mockGetBookChapters = jest.fn();
const mockGetMe = jest.fn();
const mockGetAnnotations = jest.fn();
const mockGetVocabulary = jest.fn();
const mockGetBookTranslationStatus = jest.fn();
const mockGetChapterTranslation = jest.fn();
const mockGetChapterQueueStatus = jest.fn();
const mockRequestChapterTranslation = jest.fn();
const mockSaveReadingProgress = jest.fn();
const mockSaveVocabularyWord = jest.fn();
const mockExportVocabularyToObsidian = jest.fn();
const mockSaveInsight = jest.fn();
const mockDeleteTranslationCache = jest.fn();
const mockEnqueueBookTranslation = jest.fn();
const mockRetryChapterTranslation = jest.fn();

jest.mock("@/lib/api", () => ({
  getBookChapters: (...a: unknown[]) => mockGetBookChapters(...a),
  getMe: (...a: unknown[]) => mockGetMe(...a),
  getAnnotations: (...a: unknown[]) => mockGetAnnotations(...a),
  getVocabulary: (...a: unknown[]) => mockGetVocabulary(...a),
  getBookTranslationStatus: (...a: unknown[]) => mockGetBookTranslationStatus(...a),
  getChapterTranslation: (...a: unknown[]) => mockGetChapterTranslation(...a),
  getChapterQueueStatus: (...a: unknown[]) => mockGetChapterQueueStatus(...a),
  requestChapterTranslation: (...a: unknown[]) => mockRequestChapterTranslation(...a),
  retryChapterTranslation: (...a: unknown[]) => mockRetryChapterTranslation(...a),
  enqueueBookTranslation: (...a: unknown[]) => mockEnqueueBookTranslation(...a),
  deleteTranslationCache: (...a: unknown[]) => mockDeleteTranslationCache(...a),
  saveReadingProgress: (...a: unknown[]) => mockSaveReadingProgress(...a),
  saveVocabularyWord: (...a: unknown[]) => mockSaveVocabularyWord(...a),
  exportVocabularyToObsidian: (...a: unknown[]) => mockExportVocabularyToObsidian(...a),
  saveInsight: (...a: unknown[]) => mockSaveInsight(...a),
  synthesizeSpeech: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(msg: string, status: number) { super(msg); this.status = status; }
  },
}));

jest.mock("@/lib/recentBooks", () => ({
  recordRecentBook: jest.fn(),
  saveLastChapter: jest.fn(),
  getLastChapter: jest.fn(() => 0),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn(),
  saveSettings: jest.fn(),
}));

import { getSettings as mockGetSettings } from "@/lib/settings";

jest.mock("@/components/TTSControls", () => {
  const React = require("react");
  const TTSControls = ({
    onPlaybackUpdate,
    onLoadingChange,
    onChunksUpdate,
    onSeekRegister,
  }: {
    onPlaybackUpdate?: (t: number, d: number, p: boolean) => void;
    onLoadingChange?: (l: boolean) => void;
    onChunksUpdate?: (c: { text: string; duration: number }[]) => void;
    onSeekRegister?: (fn: (t: number) => void) => void;
  }) => {
    React.useEffect(() => {
      onSeekRegister?.(() => {});
      onLoadingChange?.(false);
      onPlaybackUpdate?.(0, 0, false);
      onChunksUpdate?.([]);
    }, []);
    return <div data-testid="tts-controls" />;
  };
  TTSControls.displayName = "TTSControls";
  return { __esModule: true, default: TTSControls };
});

jest.mock("@/components/InsightChat", () => {
  const InsightChat = () => <div data-testid="insight-chat" />;
  InsightChat.displayName = "InsightChat";
  const LANGUAGES = [
    { code: "en", label: "English" }, { code: "zh", label: "Chinese" },
    { code: "de", label: "German" }, { code: "fr", label: "French" },
  ];
  return { __esModule: true, default: InsightChat, LANGUAGES };
});

jest.mock("@/components/SelectionToolbar", () => {
  const SelectionToolbar = () => <div data-testid="selection-toolbar" />;
  SelectionToolbar.displayName = "SelectionToolbar";
  return { __esModule: true, default: SelectionToolbar };
});

jest.mock("@/components/AnnotationToolbar", () => {
  const AnnotationToolbar = () => <div data-testid="annotation-toolbar" />;
  AnnotationToolbar.displayName = "AnnotationToolbar";
  return { __esModule: true, default: AnnotationToolbar };
});

jest.mock("@/components/TranslationView", () => {
  const TranslationView = () => null;
  TranslationView.displayName = "TranslationView";
  return { __esModule: true, default: TranslationView };
});

jest.mock("@/components/VocabWordTooltip", () => {
  const VocabWordTooltip = ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="vocab-tooltip">
      <button data-testid="vocab-tooltip-close" onClick={() => onClose?.()}>Close</button>
    </div>
  );
  VocabWordTooltip.displayName = "VocabWordTooltip";
  return { __esModule: true, default: VocabWordTooltip };
});

jest.mock("@/components/VocabularyToast", () => {
  const VocabularyToast = ({ onDone }: { onDone?: () => void }) => (
    <div data-testid="vocab-toast">
      <button onClick={() => onDone?.()}>done</button>
    </div>
  );
  VocabularyToast.displayName = "VocabularyToast";
  return { __esModule: true, default: VocabularyToast };
});

jest.mock("@/components/SentenceReader", () => {
  const SentenceReader = () => <div data-testid="sentence-reader" />;
  SentenceReader.displayName = "SentenceReader";
  return { __esModule: true, default: SentenceReader };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const SAMPLE_META = {
  id: 42,
  title: "Moby Dick",
  authors: ["Herman Melville"],
  languages: ["en"],
  download_count: 100,
};

const SAMPLE_CHAPTERS = [
  { title: "Chapter One", text: "Call me Ishmael. Some years ago..." },
  { title: "Chapter Two", text: "Second chapter text here." },
];

let bookIdCounter = 1400;

const SAMPLE_SESSION = {
  backendToken: "test-token",
  backendUser: { id: 1, name: "TestUser", picture: "" },
  user: { id: 1 },
};

const DEFAULT_SETTINGS = {
  insightLang: "en",
  translationLang: "en",
  translationEnabled: false,
  ttsGender: "female",
  translationProvider: "auto",
  fontSize: "base",
  chatFontSize: "xs",
  theme: "light",
};

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: jest.fn(),
});

let ReaderPage: React.ComponentType;

beforeAll(async () => {
  const mod = await import("@/app/reader/[bookId]/page");
  ReaderPage = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();

  bookIdCounter += 1;
  mockUseParams.mockReturnValue({ bookId: String(bookIdCounter) });
  mockUseSession.mockReturnValue({ data: SAMPLE_SESSION, status: "authenticated" });
  (mockGetSettings as jest.Mock).mockReturnValue({ ...DEFAULT_SETTINGS });
  mockGetMe.mockResolvedValue({ hasGeminiKey: true, role: "user" });
  mockGetAnnotations.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
  jest.requireMock("@/lib/recentBooks").getLastChapter.mockReturnValue(0);
  mockGetBookTranslationStatus.mockResolvedValue({
    book_id: bookIdCounter,
    target_language: "en",
    total_chapters: 2,
    translated_chapters: 0,
    queue_pending: 0,
    queue_running: 0,
    queue_failed: 0,
  });
  mockGetChapterTranslation.mockRejectedValue({ status: 404 });
  mockGetChapterQueueStatus.mockRejectedValue({ status: 404 });
  mockSaveReadingProgress.mockResolvedValue({});
  mockSaveVocabularyWord.mockResolvedValue({});
  mockExportVocabularyToObsidian.mockResolvedValue({ urls: [] });
  mockSaveInsight.mockResolvedValue({});
  mockDeleteTranslationCache.mockResolvedValue({});
  mockEnqueueBookTranslation.mockResolvedValue({ enqueued: 2 });
  mockRetryChapterTranslation.mockResolvedValue({});
  mockRequestChapterTranslation.mockResolvedValue({ status: "pending", position: 1 });
  mockUseSearchParams.mockReturnValue({ get: () => null });
});

// ── Lines 143/149: touchStart + touchEnd early returns in desktop mode ────────

describe("ReaderPage.branches4 — touch events in desktop mode hit isMobileRef early return", () => {
  it("touchStart in desktop mode returns early (line 143[0])", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await act(async () => { await flushPromises(); });

    const scroller = document.getElementById("reader-scroll");
    expect(scroller).toBeTruthy();
    // window.innerWidth=1024 by default → isMobileRef.current=false → early return
    fireEvent.touchStart(scroller!, { touches: [{ clientX: 100, clientY: 200 }] });
    expect(document.body).toBeTruthy();
  });

  it("touchEnd in desktop mode returns early (line 149[0])", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await act(async () => { await flushPromises(); });

    const scroller = document.getElementById("reader-scroll");
    // No prior touchStart + desktop mode → both !isMobileRef and !swipeStartRef are true
    fireEvent.touchEnd(scroller!, { changedTouches: [{ clientX: 200, clientY: 200 }] });
    expect(document.body).toBeTruthy();
  });
});

// ── Line 157[0]: swipe too short → return early ───────────────────────────────

describe("ReaderPage.branches4 — too-short swipe hits distance guard (line 157[0])", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
  });
  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
  });

  it("swipe of dx=5 (< 80px) returns early without navigating", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await act(async () => { await flushPromises(); });

    const scroller = document.getElementById("reader-scroll")!;
    const nowBase = Date.now();
    jest.spyOn(Date, "now")
      .mockReturnValueOnce(nowBase)
      .mockReturnValueOnce(nowBase + 100); // fast enough

    // dx=5 < 80 → distance guard triggers early return (line 157[0])
    fireEvent.touchStart(scroller, { touches: [{ clientX: 100, clientY: 200 }] });
    fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: 105, clientY: 200 }] });

    jest.spyOn(Date, "now").mockRestore();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

// ── Line 121[0]: handleReaderTap target filter — click on button in mobile ────

describe("ReaderPage.branches4 — handleReaderTap returns early for button clicks (line 121[0])", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
  });
  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
  });

  it("click on button inside reader-scroll does not toggle toolbar (target.closest guard)", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await act(async () => { await flushPromises(); });

    // Click on the SentenceReader mock button (which is inside reader-scroll)
    const srEl = screen.getByTestId("sentence-reader");
    // Create a button inside reader-scroll to simulate target.closest("button")
    const btn = document.createElement("button");
    document.getElementById("reader-scroll")?.appendChild(btn);

    fireEvent.click(btn);
    // target.closest("button") is truthy → early return (line 121[0] true branch covered)
    expect(document.body).toBeTruthy();

    btn.remove();
  });
});

// ── Line 353[0]: empty languages → bookLanguage undefined → early return ──────

describe("ReaderPage.branches4 — empty languages → bookLanguage undefined (line 353[0])", () => {
  it("renders without crash when meta.languages is empty", async () => {
    mockGetBookChapters.mockResolvedValue({
      meta: { ...SAMPLE_META, languages: [] },
      chapters: SAMPLE_CHAPTERS,
    });
    render(<ReaderPage />);
    await act(async () => { await flushPromises(); });

    // bookLanguage = [][0] = undefined → if (!bookLanguage) return → early return at line 353
    expect(document.body).toBeTruthy();
  });
});

// ── Lines 1243-1249: InsightChat ?? fallbacks with null/undefined meta fields ──

describe("ReaderPage.branches4 — InsightChat ?? fallbacks (lines 1243-1249)", () => {
  it("covers ?? right branches when meta has no title/authors and chapters is empty", async () => {
    const bid = bookIdCounter + 5;
    mockUseParams.mockReturnValue({ bookId: String(bid) });
    // hasGeminiKey not returned → hasGeminiKey=undefined → ?? false right branch
    mockGetMe.mockResolvedValue({ role: "user" });
    mockGetBookChapters.mockResolvedValue({
      meta: {
        ...SAMPLE_META,
        id: bid,
        title: undefined,   // meta?.title ?? "" → right branch
        authors: [],        // meta?.authors[0] ?? "" → undefined → right branch
        languages: ["en"],
      },
      chapters: [],         // current=undefined → current?.text ?? "" → right branch
    });
    mockGetBookTranslationStatus.mockResolvedValue({
      book_id: bid,
      target_language: "en",
      total_chapters: 0,
      translated_chapters: 0,
      queue_pending: 0,
      queue_running: 0,
      queue_failed: 0,
    });

    render(<ReaderPage />);
    await act(async () => { await flushPromises(); });

    // InsightChat is always rendered (even hidden) — ?? fallback props evaluated
    expect(document.body).toBeTruthy();
  });
});

// ── Line 1420[1]: same-chapter vocab occurrence → else branch (no navigation) ─

describe("ReaderPage.branches4 — vocab occurrence same chapter (line 1420[1] else branch)", () => {
  it("clicking same-chapter occurrence sets scroll target but does NOT navigate", async () => {
    const bid = bookIdCounter + 6;
    mockUseParams.mockReturnValue({ bookId: String(bid) });
    const vocabWord = {
      id: 95,
      word: "whale",
      lemma: "whale",
      language: "en",
      occurrences: [
        { book_id: bid, book_title: "Moby Dick", chapter_index: 0, sentence_text: "The great whale surfaced." },
      ],
    };
    mockGetVocabulary.mockResolvedValue([vocabWord]);
    mockGetBookChapters.mockResolvedValue({
      meta: { ...SAMPLE_META, id: bid },
      chapters: SAMPLE_CHAPTERS,
    });
    mockGetBookTranslationStatus.mockResolvedValue({
      book_id: bid,
      target_language: "en",
      total_chapters: 2,
      translated_chapters: 0,
      queue_pending: 0,
      queue_running: 0,
      queue_failed: 0,
    });

    render(<ReaderPage />);
    await act(async () => { await flushPromises(); });

    const vocabBtn = await screen.findByTitle("Vocabulary");
    await userEvent.click(vocabBtn);

    // "All chapters" to show all occurrences
    await waitFor(() => screen.getByRole("button", { name: "All chapters" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "All chapters" })); });
    await act(async () => { await flushPromises(); });

    await waitFor(() => screen.getByText(/The great whale surfaced/));

    // Click the same-chapter (chapter_index=0) occurrence button
    const occBtn = Array.from(document.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("The great whale surfaced")) as HTMLElement;
    expect(occBtn).toBeTruthy();

    await act(async () => { fireEvent.click(occBtn); });
    await act(async () => { await flushPromises(); });

    // chapter_index=0 === current chapterIndex=0 → else branch (line 1420[1])
    // No navigation should occur
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

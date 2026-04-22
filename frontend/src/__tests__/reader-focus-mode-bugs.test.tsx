/**
 * Regression tests for focus mode bugs:
 * - Header not hidden on desktop when focus mode is active (#toolbarVisible always true on desktop)
 * - "Aa" button in focus HUD had no effect (missing typographyAnchorPos → panel renders off-screen)
 * - Sidebar not closed when entering focus mode
 */
import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

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
const mockRetryChapterTranslation = jest.fn();
const mockEnqueueBookTranslation = jest.fn();
const mockDeleteTranslationCache = jest.fn();
const mockSaveReadingProgress = jest.fn();
const mockSaveVocabularyWord = jest.fn();
const mockExportVocabularyToObsidian = jest.fn();
const mockSaveInsight = jest.fn();
const mockSynthesizeSpeech = jest.fn();

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
  synthesizeSpeech: (...a: unknown[]) => mockSynthesizeSpeech(...a),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(msg: string, status: number) { super(msg); this.status = status; }
  },
}));

// ─── @/lib/recentBooks ───────────────────────────────────────────────────────
const mockRecordRecentBook = jest.fn();
const mockSaveLastChapter = jest.fn();
const mockGetLastChapter = jest.fn();

jest.mock("@/lib/recentBooks", () => ({
  recordRecentBook: (...a: unknown[]) => mockRecordRecentBook(...a),
  saveLastChapter: (...a: unknown[]) => mockSaveLastChapter(...a),
  getLastChapter: (...a: unknown[]) => mockGetLastChapter(...a),
}));

// ─── @/lib/settings ──────────────────────────────────────────────────────────
const mockGetSettings = jest.fn();
const mockSaveSettings = jest.fn();

jest.mock("@/lib/settings", () => ({
  getSettings: (...a: unknown[]) => mockGetSettings(...a),
  saveSettings: (...a: unknown[]) => mockSaveSettings(...a),
}));

// ─── Heavy UI components ──────────────────────────────────────────────────────
jest.mock("@/components/TTSControls", () => {
  const TTSControls = () => <div data-testid="tts-controls" />;
  TTSControls.displayName = "TTSControls";
  return { __esModule: true, default: TTSControls };
});

jest.mock("@/components/SentenceReader", () => {
  const SentenceReader = () => <div data-testid="sentence-reader" />;
  SentenceReader.displayName = "SentenceReader";
  return { __esModule: true, default: SentenceReader };
});

jest.mock("@/components/InsightChat", () => {
  const InsightChat = () => <div data-testid="insight-chat" />;
  InsightChat.displayName = "InsightChat";
  const LANGUAGES = [
    { code: "en", label: "English" }, { code: "zh", label: "Chinese" },
    { code: "de", label: "German" }, { code: "fr", label: "French" },
    { code: "es", label: "Spanish" }, { code: "ja", label: "Japanese" },
    { code: "ko", label: "Korean" }, { code: "ru", label: "Russian" },
    { code: "ar", label: "Arabic" }, { code: "pt", label: "Portuguese" },
  ];
  return { __esModule: true, default: InsightChat, LANGUAGES };
});

jest.mock("@/components/SelectionToolbar", () => {
  const SelectionToolbar = () => null;
  SelectionToolbar.displayName = "SelectionToolbar";
  return { __esModule: true, default: SelectionToolbar };
});

jest.mock("@/components/AnnotationToolbar", () => {
  const AnnotationToolbar = () => null;
  AnnotationToolbar.displayName = "AnnotationToolbar";
  return { __esModule: true, default: AnnotationToolbar };
});

jest.mock("@/components/TranslationView", () => {
  const TranslationView = () => null;
  TranslationView.displayName = "TranslationView";
  return { __esModule: true, default: TranslationView };
});

jest.mock("@/components/VocabularyToast", () => {
  const VocabularyToast = () => null;
  VocabularyToast.displayName = "VocabularyToast";
  return { __esModule: true, default: VocabularyToast };
});

jest.mock("@/components/VocabWordTooltip", () => {
  const VocabWordTooltip = () => <div data-testid="vocab-word-tooltip" />;
  VocabWordTooltip.displayName = "VocabWordTooltip";
  return { __esModule: true, default: VocabWordTooltip };
});

// ─── Data fixtures ────────────────────────────────────────────────────────────
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

let bookIdCounter = 3000;

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

// Stub getBoundingClientRect so the HUD "Aa" anchor calculation works in jsdom
Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
  configurable: true,
  value: () => ({ top: 10, bottom: 30, left: 0, right: 100, width: 100, height: 20, x: 0, y: 10 }),
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
  mockUseSearchParams.mockImplementation(() => ({ get: () => null }));
  mockGetLastChapter.mockReturnValue(0);
  mockUseSession.mockReturnValue({ data: SAMPLE_SESSION, status: "authenticated" });
  mockGetSettings.mockReturnValue({ ...DEFAULT_SETTINGS });
  mockGetMe.mockResolvedValue({ hasGeminiKey: true, role: "user" });
  mockGetAnnotations.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
  mockGetBookTranslationStatus.mockResolvedValue({
    book_id: bookIdCounter, target_language: "en", total_chapters: 2,
    translated_chapters: 0, queue_pending: 0, queue_running: 0, queue_failed: 0,
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
  // Desktop viewport
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
});

// ─── helper: render and wait for chapter load ─────────────────────────────────
async function renderReader() {
  mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
  render(<ReaderPage />);
  await act(async () => { await flushPromises(); });
  await screen.findByTestId("reader-chapter-heading");
}

// ─── Bug: header not hidden on desktop in focus mode ─────────────────────────

describe("focus mode — header hidden", () => {
  it("header gets opacity-0 when Focus button is clicked (desktop)", async () => {
    await renderReader();
    const header = document.querySelector("header")!;
    // Baseline: header visible on desktop
    expect(header.className).not.toMatch(/opacity-0/);

    const focusBtn = screen.getByTitle("Focus mode (F)");
    await act(async () => { fireEvent.click(focusBtn); });

    expect(header.className).toMatch(/opacity-0/);
  });

  it("header gets opacity-0 when F key is pressed (desktop)", async () => {
    await renderReader();
    const header = document.querySelector("header")!;

    await act(async () => {
      fireEvent.keyDown(document, { key: "F" });
    });

    expect(header.className).toMatch(/opacity-0/);
  });

  it("header becomes visible again when focus mode is exited via F key", async () => {
    await renderReader();
    const header = document.querySelector("header")!;

    await act(async () => { fireEvent.keyDown(document, { key: "F" }); });
    expect(header.className).toMatch(/opacity-0/);

    await act(async () => { fireEvent.keyDown(document, { key: "F" }); });
    expect(header.className).not.toMatch(/opacity-0/);
  });
});

// ─── Bug: "Aa" button in HUD has no effect (missing anchorPos) ───────────────

describe("focus mode — HUD Aa button shows TypographyPanel", () => {
  it("clicking Aa in focus HUD renders the typography panel", async () => {
    await renderReader();

    // Enter focus mode
    const focusBtn = screen.getByTitle("Focus mode (F)");
    await act(async () => { fireEvent.click(focusBtn); });

    // The HUD should now be visible
    const hudAa = screen.getByTitle("Typography");
    expect(hudAa).toBeInTheDocument();

    // Click Aa — panel should appear
    await act(async () => { fireEvent.click(hudAa); });

    expect(screen.getByTestId("typography-panel")).toBeInTheDocument();
  });

  it("clicking Aa again in HUD closes the panel", async () => {
    await renderReader();

    await act(async () => { fireEvent.click(screen.getByTitle("Focus mode (F)")); });
    const hudAa = screen.getByTitle("Typography");
    await act(async () => { fireEvent.click(hudAa); });
    expect(screen.getByTestId("typography-panel")).toBeInTheDocument();

    await act(async () => { fireEvent.click(hudAa); });
    expect(screen.queryByTestId("typography-panel")).not.toBeInTheDocument();
  });
});

// ─── Bug: sidebar not closed when entering focus mode ────────────────────────

describe("focus mode — sidebar auto-closes", () => {
  it("open sidebar collapses when focus mode is entered via button", async () => {
    await renderReader();

    // Open the chat sidebar (both desktop + mobile InsightChat instances mount)
    const chatBtn = screen.getByTitle("Toggle insight chat");
    await act(async () => { fireEvent.click(chatBtn); });
    expect(screen.getAllByTestId("insight-chat").length).toBeGreaterThan(0);

    // Enter focus mode — sidebarOpen should go false
    await act(async () => { fireEvent.click(screen.getByTitle("Focus mode (F)")); });

    // Both sidebar instances should be unmounted (sidebarOpen=false)
    expect(screen.queryAllByTestId("insight-chat")).toHaveLength(0);
  });

  it("open sidebar collapses when focus mode is entered via F key", async () => {
    await renderReader();

    const chatBtn = screen.getByTitle("Toggle insight chat");
    await act(async () => { fireEvent.click(chatBtn); });
    expect(screen.getAllByTestId("insight-chat").length).toBeGreaterThan(0);

    await act(async () => { fireEvent.keyDown(document, { key: "F" }); });

    expect(screen.queryAllByTestId("insight-chat")).toHaveLength(0);
  });
});

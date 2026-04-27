/**
 * Tests for translation cost estimate in the reader sidebar.
 * Originally issue #1739 (per-chapter estimate under "Translate this chapter").
 * Updated: cost moved to the "Translate remaining N" queue button area,
 * showing total queue cost estimate (notStarted × avg chapter cost).
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// ─── next-auth ────────────────────────────────────────────────────────────────
const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

// ─── next/navigation ─────────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useParams: () => ({ bookId: "42" }),
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
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
const mockGetWordDefinition = jest.fn();
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
  getWordDefinition: (...a: unknown[]) => mockGetWordDefinition(...a),
  exportVocabularyToObsidian: (...a: unknown[]) => mockExportVocabularyToObsidian(...a),
  saveInsight: (...a: unknown[]) => mockSaveInsight(...a),
  synthesizeSpeech: (...a: unknown[]) => mockSynthesizeSpeech(...a),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(msg: string, status: number) { super(msg); this.status = status; }
  },
}));

// ─── @/lib/recentBooks ───────────────────────────────────────────────────────
jest.mock("@/lib/recentBooks", () => ({
  recordRecentBook: jest.fn(),
  saveLastChapter: jest.fn(),
  getLastChapter: jest.fn().mockReturnValue(0),
}));

// ─── @/lib/settings ──────────────────────────────────────────────────────────
jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn().mockReturnValue({
    translationEnabled: true,
    translationLang: "de",
    insightLang: "en",
    ttsRate: 1,
    ttsPitch: 1,
    ttsGender: "female",
    displayMode: "inline",
    fontSize: "base",
    lineHeight: "normal",
    contentWidth: "normal",
    fontFamily: "serif",
    paragraphFocus: false,
  }),
  saveSettings: jest.fn(),
}));

// ─── Heavy UI components ──────────────────────────────────────────────────────
jest.mock("@/components/TTSControls", () => ({
  __esModule: true,
  default: () => <div data-testid="tts-controls" />,
}));

jest.mock("@/components/SentenceReader", () => ({
  __esModule: true,
  default: () => <div data-testid="sentence-reader" />,
}));

jest.mock("@/components/InsightChat", () => {
  const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "de", label: "German" },
    { code: "fr", label: "French" },
  ];
  return {
    __esModule: true,
    default: () => <div data-testid="insight-chat" />,
    LANGUAGES,
  };
});

jest.mock("@/components/SelectionToolbar", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/AnnotationToolbar", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/TranslationView", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/VocabularyToast", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/VocabWordTooltip", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/AnnotationsSidebar", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/WordActionDrawer", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/ChapterSummary", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/TypographyPanel", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/UndoToast", () => ({
  __esModule: true,
  default: () => null,
}));

import ReaderPage from "@/app/reader/[bookId]/page";

const CHAPTER_TEXT = "Word ".repeat(2000).trim(); // 2000 words
const SAMPLE_CHAPTERS = [
  { title: "Chapter One", text: CHAPTER_TEXT },
];

const SAMPLE_SESSION = {
  backendToken: "test-token",
  backendUser: { id: 1, name: "TestUser", picture: "" },
  user: { id: 1 },
};

function setupMocks({
  hasGeminiKey,
  translationStatus = null,
}: {
  hasGeminiKey: boolean;
  translationStatus?: Record<string, number> | null;
}) {
  mockUseSession.mockReturnValue({ data: { ...SAMPLE_SESSION }, status: "authenticated" });

  mockGetBookChapters.mockResolvedValue({
    meta: { id: 42, title: "Test Book", authors: [], languages: ["en"], download_count: 0 },
    chapters: SAMPLE_CHAPTERS,
  });

  mockGetMe.mockResolvedValue({
    id: 1,
    name: "TestUser",
    email: "t@t.com",
    picture: "",
    is_admin: false,
    hasGeminiKey,
  });

  mockGetAnnotations.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
  mockGetBookTranslationStatus.mockResolvedValue(translationStatus);
  mockGetChapterTranslation.mockResolvedValue({ status: "not_found" });
  mockGetChapterQueueStatus.mockResolvedValue({ status: "not_found" });
  mockSaveReadingProgress.mockResolvedValue({});
}

beforeEach(() => {
  jest.clearAllMocks();
});

async function openTranslateSidebar() {
  const translateTab = await screen.findByRole("button", { name: /translate/i });
  fireEvent.click(translateTab);
}

const STATUS_WITH_UNTRANSLATED = {
  translated_chapters: 0,
  total_chapters: 5,
  queue_pending: 0,
  queue_running: 0,
  queue_failed: 0,
  active: true,
  active_language: "de",
};

describe("Reader — cost estimate near queue button (translation sidebar)", () => {
  it("shows cost estimate near the queue button when hasGeminiKey is true and chapters remain", async () => {
    setupMocks({ hasGeminiKey: true, translationStatus: STATUS_WITH_UNTRANSLATED });
    render(<ReaderPage />);

    await openTranslateSidebar();

    // The "Translate remaining N" queue button should appear
    const queueBtn = await screen.findByRole("button", { name: /translate remaining/i });
    expect(queueBtn).toBeInTheDocument();

    // Cost estimate should be visible near the queue button (not under "Translate this chapter")
    await waitFor(() => {
      const costEl = screen.queryByText(/rough estimate/i);
      expect(costEl).toBeInTheDocument();
    });
  });

  it("does not show cost estimate under the single-chapter translate button", async () => {
    setupMocks({ hasGeminiKey: true, translationStatus: null });
    render(<ReaderPage />);

    await openTranslateSidebar();

    const translateBtn = await screen.findByRole("button", { name: /translate this chapter/i });
    expect(translateBtn).toBeInTheDocument();

    // No cost estimate should appear when there's no book-level queue section
    const costEl = screen.queryByText(/rough estimate/i);
    expect(costEl).not.toBeInTheDocument();
  });

  it("does not show cost estimate when hasGeminiKey is false", async () => {
    setupMocks({ hasGeminiKey: false, translationStatus: STATUS_WITH_UNTRANSLATED });
    render(<ReaderPage />);

    await openTranslateSidebar();

    await screen.findByRole("button", { name: /translate remaining/i });

    // Cost estimate should NOT appear without a Gemini key
    const costEl = screen.queryByText(/rough estimate/i);
    expect(costEl).not.toBeInTheDocument();
  });
});

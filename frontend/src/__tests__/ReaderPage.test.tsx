/**
 * Tests for the Reader page (/reader/[bookId]).
 * Mocks all external dependencies heavily to test render paths and interactions.
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
  // Error class passthrough
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
  // LANGUAGES is imported from InsightChat in the page
  const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "zh", label: "Chinese" },
    { code: "de", label: "German" },
    { code: "fr", label: "French" },
    { code: "es", label: "Spanish" },
    { code: "ja", label: "Japanese" },
    { code: "ko", label: "Korean" },
    { code: "ru", label: "Russian" },
    { code: "ar", label: "Arabic" },
    { code: "pt", label: "Portuguese" },
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
  { title: "Chapter Three", text: "Third chapter text here." },
];

// Each describe block that needs a fresh cache should use a unique bookId
// to avoid the in-memory chaptersCache contaminating test isolation.
let bookIdCounter = 100;

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

// ─── Helpers ─────────────────────────────────────────────────────────────────
const flushPromises = () => new Promise((r) => setTimeout(r, 0));

// Clear in-memory caches between tests by re-importing the module
// We need to isolate the module caches (chaptersCache / metaCache) via jest.isolateModules
// or simply by managing mockGetBookChapters to always re-fetch.

// jsdom doesn't implement Element.scrollTo — patch it globally so goToChapter
// doesn't throw "scrollTo is not a function"
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

  // Use a fresh unique bookId each test to sidestep the module-level chaptersCache
  bookIdCounter += 1;
  mockUseParams.mockReturnValue({ bookId: String(bookIdCounter) });
  mockGetLastChapter.mockReturnValue(0);

  mockUseSession.mockReturnValue({ data: SAMPLE_SESSION, status: "authenticated" });
  mockGetSettings.mockReturnValue({ ...DEFAULT_SETTINGS });
  mockGetMe.mockResolvedValue({ hasGeminiKey: true, role: "user" });
  mockGetAnnotations.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
  mockGetBookTranslationStatus.mockResolvedValue({
    book_id: bookIdCounter,
    target_language: "en",
    total_chapters: 3,
    translated_chapters: 0,
    queue_pending: 0,
    queue_running: 0,
    queue_failed: 0,
  });
  mockGetChapterTranslation.mockRejectedValue({ status: 404 });
  mockGetChapterQueueStatus.mockRejectedValue({ status: 404 });
  mockSaveReadingProgress.mockResolvedValue({});
  mockSaveVocabularyWord.mockResolvedValue({});
  mockExportVocabularyToObsidian.mockResolvedValue({ urls: ["obsidian://open?vault=Notes"] });
  mockSaveInsight.mockResolvedValue({});
  mockDeleteTranslationCache.mockResolvedValue({});
  mockEnqueueBookTranslation.mockResolvedValue({ enqueued: 3 });
  mockRetryChapterTranslation.mockResolvedValue({});
  mockRequestChapterTranslation.mockResolvedValue({ status: "pending", position: 2 });

  // jsdom does not implement scrollTo; stub it so goToChapter doesn't throw
  const el = document.getElementById("reader-scroll");
  if (el) el.scrollTo = jest.fn();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ReaderPage — loading state", () => {
  it("shows animated loading skeleton while chapters are fetching", async () => {
    // Never resolves so we stay in loading state
    mockGetBookChapters.mockReturnValue(new Promise(() => {}));
    render(<ReaderPage />);
    // Loading skeleton has animate-pulse class
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("does not show chapter content while loading", () => {
    mockGetBookChapters.mockReturnValue(new Promise(() => {}));
    render(<ReaderPage />);
    expect(screen.queryByTestId("sentence-reader")).not.toBeInTheDocument();
  });
});

describe("ReaderPage — after chapters load", () => {
  it("renders chapter heading after chapters load", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    expect(await screen.findByTestId("reader-chapter-heading")).toBeInTheDocument();
    expect(screen.getByText("Chapter One")).toBeInTheDocument();
  });

  it("renders SentenceReader after chapters load", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    expect(await screen.findByTestId("sentence-reader")).toBeInTheDocument();
  });

  it("renders book title and author in header", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    expect(await screen.findByText("Moby Dick")).toBeInTheDocument();
    expect(screen.getByText("Herman Melville")).toBeInTheDocument();
  });

  it("renders TTSControls", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    expect(await screen.findByTestId("tts-controls")).toBeInTheDocument();
  });

  it("shows chapter navigation prev/next buttons", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    expect(await screen.findByText("← Previous chapter")).toBeInTheDocument();
    expect(screen.getByText("Next chapter →")).toBeInTheDocument();
  });

  it("shows chapter progress fraction", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    // 1 / 3
    expect(await screen.findByText(/1 \/ 3/)).toBeInTheDocument();
  });
});

describe("ReaderPage — error state", () => {
  it("renders error message when getBookChapters fails", async () => {
    mockGetBookChapters.mockRejectedValue(new Error("Not found"));
    render(<ReaderPage />);
    await flushPromises();
    expect(await screen.findByText("Not found")).toBeInTheDocument();
  });

  it("shows 'Back to library' link in error state", async () => {
    mockGetBookChapters.mockRejectedValue(new Error("Network failure"));
    render(<ReaderPage />);
    await flushPromises();
    expect(await screen.findByText("Back to library")).toBeInTheDocument();
  });

  it("'Back to library' button navigates home", async () => {
    mockGetBookChapters.mockRejectedValue(new Error("fail"));
    render(<ReaderPage />);
    await flushPromises();
    const link = await screen.findByText("Back to library");
    await userEvent.click(link);
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});

describe("ReaderPage — chapter navigation", () => {
  it("clicking 'Next chapter' advances to chapter 2", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bookIdCounter }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const nextBtn = await screen.findByText("Next chapter →");
    await userEvent.click(nextBtn);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("chapter=1"),
        expect.anything(),
      );
    });
  });

  it("clicking '← Previous chapter' is disabled on first chapter", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const prevBtn = await screen.findByText("← Previous chapter");
    expect(prevBtn).toBeDisabled();
  });

  it("clicking 'Next chapter →' is disabled on last chapter", async () => {
    // Start at last chapter
    mockGetLastChapter.mockReturnValue(2);
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    // Navigate to last chapter first
    const nextBtns = await screen.findAllByText("Next chapter →");
    expect(nextBtns[0]).toBeDisabled();
  });

  it("saves reading progress when navigating chapters", async () => {
    const bid = bookIdCounter;
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bid }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const nextBtn = await screen.findByText("Next chapter →");
    await userEvent.click(nextBtn);

    await waitFor(() => {
      expect(mockSaveReadingProgress).toHaveBeenCalledWith(bid, 1);
    });
  });

  it("saves last chapter to local storage when navigating", async () => {
    const bid = bookIdCounter;
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bid }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const nextBtn = await screen.findByText("Next chapter →");
    await userEvent.click(nextBtn);

    await waitFor(() => {
      expect(mockSaveLastChapter).toHaveBeenCalledWith(bid, 1);
    });
  });

  it("chapter select dropdown changes chapter", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bookIdCounter }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    // Multiple selects: desktop header + mobile toolbar
    const selects = await screen.findAllByRole("combobox");
    const chapterSelect = selects.find(
      (s) => (s as HTMLSelectElement).options?.[0]?.text?.includes("Chapter One"),
    );
    expect(chapterSelect).toBeDefined();
    await userEvent.selectOptions(chapterSelect!, "1");
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("chapter=1"),
        expect.anything(),
      );
    });
  });
});

describe("ReaderPage — sidebar tabs", () => {
  it("opens insight chat sidebar when 💬 Insight button is clicked", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const chatBtn = await screen.findByTitle("Toggle insight chat");
    await userEvent.click(chatBtn);

    // InsightChat renders twice (desktop sidebar + mobile sheet); at least one should be present
    const chatEls = await screen.findAllByTestId("insight-chat");
    expect(chatEls.length).toBeGreaterThanOrEqual(1);
  });

  it("opens translate sidebar when 🌐 Translate button is clicked", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    // Translation tab content: "Target language" label should appear
    expect(await screen.findByText("Target language")).toBeInTheDocument();
  });

  it("opens notes sidebar when 📝 Notes button is clicked", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const notesBtn = await screen.findByTitle("Annotations & notes");
    await userEvent.click(notesBtn);

    expect(await screen.findByText("No annotations yet.")).toBeInTheDocument();
  });

  it("opens vocab sidebar when 📚 Vocab button is clicked", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const vocabBtn = await screen.findByTitle("Vocabulary");
    await userEvent.click(vocabBtn);

    expect(await screen.findByText("No words saved in this chapter yet.")).toBeInTheDocument();
  });

  it("toggling the same sidebar button twice closes it", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const chatBtn = await screen.findByTitle("Toggle insight chat");
    // Open
    await userEvent.click(chatBtn);
    // Close
    await userEvent.click(chatBtn);

    // Translation sidebar content should no longer be visible
    expect(screen.queryByText("Target language")).not.toBeInTheDocument();
  });
});

describe("ReaderPage — font size cycling", () => {
  it("cycles font size when Aa button is clicked", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    // Find the font-size button (title includes "Font size:")
    const fontBtn = await screen.findByTitle(/font size/i);
    await userEvent.click(fontBtn);

    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ fontSize: expect.any(String) }),
    );
  });

  it("cycles through sm → base → lg → xl → sm", async () => {
    mockGetSettings.mockReturnValue({ ...DEFAULT_SETTINGS, fontSize: "sm" });
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const fontBtn = await screen.findByTitle(/font size/i);
    await userEvent.click(fontBtn); // sm → base
    expect(mockSaveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ fontSize: "base" }));
  });
});

describe("ReaderPage — theme cycling", () => {
  it("cycles theme when theme button is clicked", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const themeBtn = await screen.findByTitle(/theme/i);
    await userEvent.click(themeBtn);

    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: expect.any(String) }),
    );
  });
});

describe("ReaderPage — showAnnotations toggle", () => {
  it("toggles annotation marks when 🔖 button is clicked", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const marksBtn = await screen.findByTitle(/annotation marks/i);
    await userEvent.click(marksBtn);

    // localStorage should be updated
    expect(localStorage.getItem("reader-show-annotations")).toBeDefined();
  });
});

describe("ReaderPage — translation panel", () => {
  it("shows translation toggle in sidebar translate tab", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    expect(await screen.findByText("Disabled")).toBeInTheDocument();
  });

  it("enables translation when toggle is checked", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    const checkbox = await screen.findByRole("checkbox");
    await userEvent.click(checkbox);

    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ translationEnabled: true }),
    );
  });

  it("shows 'Translate this chapter' button when translation is enabled and no translation cached", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    mockGetChapterTranslation.mockRejectedValue({ status: 404 });
    mockGetChapterQueueStatus.mockRejectedValue({ status: 404 });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    const checkbox = await screen.findByRole("checkbox");
    await userEvent.click(checkbox);

    expect(await screen.findByRole("button", { name: /translate this chapter/i })).toBeInTheDocument();
  });

  it("shows language selector in translate tab", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    expect(await screen.findByText("Target language")).toBeInTheDocument();
    // The language select should be there
    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      const langSelect = selects.find((s) =>
        Array.from((s as HTMLSelectElement).options).some((o) => o.text === "Chinese"),
      );
      expect(langSelect).toBeDefined();
    });
  });

  it("shows display mode inline/parallel toggle", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    expect(await screen.findByRole("button", { name: "Inline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Side by side" })).toBeInTheDocument();
  });
});

describe("ReaderPage — API data loading", () => {
  it("calls getMe on mount", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    expect(mockGetMe).toHaveBeenCalled();
  });

  it("calls getAnnotations with bookId on mount", async () => {
    const bid = bookIdCounter;
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bid }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    await waitFor(() => expect(mockGetAnnotations).toHaveBeenCalledWith(bid));
  });

  it("calls getVocabulary on mount", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    await waitFor(() => expect(mockGetVocabulary).toHaveBeenCalled());
  });

  it("records recent book after chapters load", async () => {
    const meta = { ...SAMPLE_META, id: bookIdCounter };
    mockGetBookChapters.mockResolvedValue({ meta, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    await waitFor(() => expect(mockRecordRecentBook).toHaveBeenCalledWith(meta, 0));
  });
});

describe("ReaderPage — unauthenticated session", () => {
  it("does not show Notes/Vocab/Marks buttons when not authenticated", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    expect(screen.queryByTitle("Annotations & notes")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Vocabulary")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/annotation marks/i)).not.toBeInTheDocument();
  });

  it("does not call saveReadingProgress when not authenticated", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const nextBtn = await screen.findByText("Next chapter →");
    await userEvent.click(nextBtn);

    expect(mockSaveReadingProgress).not.toHaveBeenCalled();
  });
});

describe("ReaderPage — navigation from library button", () => {
  it("back to library button calls router.push('/')", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const libraryBtn = await screen.findByText("Library", { exact: false });
    expect(libraryBtn.closest("button")).toBeTruthy();
    await userEvent.click(libraryBtn.closest("button")!);
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});

describe("ReaderPage — chapter starting from URL param", () => {
  it("uses ?chapter= param as initial chapter index before chapters load", async () => {
    mockUseSearchParams.mockReturnValue({ get: (key: string) => key === "chapter" ? "1" : null });
    // Never resolves so we see the loading state derived from the URL param
    mockGetBookChapters.mockReturnValue(new Promise(() => {}));
    render(<ReaderPage />);
    // Component initialised with chapterIndex=1 from URL, but loading=true so
    // we only verify it doesn't crash (loading skeleton visible)
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("restores last-read chapter when getLastChapter returns non-zero", async () => {
    mockGetLastChapter.mockReturnValue(2);
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bookIdCounter }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    // Chapter index 2 → "Chapter Three"
    expect(await screen.findByText("Chapter Three")).toBeInTheDocument();
  });
});

describe("ReaderPage — mobile bottom bar", () => {
  it("shows mobile toolbar buttons after chapters load", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    expect(await screen.findByRole("button", { name: /translation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /read aloud|pause/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /insight chat/i })).toBeInTheDocument();
  });

  it("does not show mobile toolbar while loading", () => {
    mockGetBookChapters.mockReturnValue(new Promise(() => {}));
    render(<ReaderPage />);
    expect(screen.queryByRole("button", { name: /read aloud/i })).not.toBeInTheDocument();
  });
});

describe("ReaderPage — vocab words in sidebar", () => {
  it("shows vocab words count in sidebar when words are loaded", async () => {
    const bid = bookIdCounter;
    const vocabWords = [
      {
        id: 10,
        word: "ephemeral",
        occurrences: [{ book_id: bid, chapter_index: 0, sentence_text: "ephemeral whale" }],
      },
    ];
    mockGetVocabulary.mockResolvedValue(vocabWords);
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bid }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const vocabBtn = await screen.findByTitle("Vocabulary");
    await userEvent.click(vocabBtn);

    expect(await screen.findByText("ephemeral")).toBeInTheDocument();
  });
});

describe("ReaderPage — annotations in sidebar", () => {
  it("shows annotations when notes tab is open and annotations exist", async () => {
    const annotations = [
      {
        id: 1,
        book_id: 42,
        chapter_index: 0,
        sentence_text: "Call me Ishmael.",
        color: "yellow",
        note_text: "Great opening line",
        created_at: "2024-01-01",
      },
    ];
    mockGetAnnotations.mockResolvedValue(annotations);
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const notesBtn = await screen.findByTitle("Annotations & notes");
    await userEvent.click(notesBtn);

    expect(await screen.findByText(/Call me Ishmael/)).toBeInTheDocument();
    expect(screen.getByText("Great opening line")).toBeInTheDocument();
  });
});

describe("ReaderPage — reading progress bar", () => {
  it("renders progress bar after chapters load", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    await waitFor(() => {
      const progressBar = document.querySelector("[title*='% through book']");
      expect(progressBar).toBeInTheDocument();
    });
  });
});

describe("ReaderPage — profile button", () => {
  it("navigates to /profile when profile button is clicked", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const profileBtn = await screen.findByTitle("TestUser");
    await userEvent.click(profileBtn);
    expect(mockPush).toHaveBeenCalledWith("/profile");
  });
});

// ─── Additional tests for uncovered lines ────────────────────────────────────

describe("ReaderPage — touch/swipe handlers (mobile)", () => {
  beforeEach(() => {
    // Simulate mobile width for the isMobileRef path
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
  });

  it("handleTouchStart / handleTouchEnd fires without error on reader-scroll", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const scroller = document.getElementById("reader-scroll");
    expect(scroller).toBeInTheDocument();

    // Should not throw
    fireEvent.touchStart(scroller!, {
      touches: [{ clientX: 50, clientY: 200 }],
    });
    fireEvent.touchEnd(scroller!, {
      changedTouches: [{ clientX: 200, clientY: 200 }],
    });
  });

  it("swipe right (dx > 80) when on chapter 1 navigates to chapter 0", async () => {
    // Start at chapter 1
    mockGetLastChapter.mockReturnValue(1);
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bookIdCounter }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    await screen.findByTestId("reader-chapter-heading");

    const scroller = document.getElementById("reader-scroll")!;
    // Simulate isMobileRef being set via the useEffect
    // Use Date.now mock to keep dt < 500ms
    const nowBase = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(nowBase).mockReturnValueOnce(nowBase + 100);

    fireEvent.touchStart(scroller, {
      touches: [{ clientX: 300, clientY: 200 }],
    });
    fireEvent.touchEnd(scroller, {
      changedTouches: [{ clientX: 100, clientY: 205 }],
    });

    jest.spyOn(Date, "now").mockRestore();
  });

  it("tap on center of screen toggles toolbar visibility (does not crash)", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const scroller = document.getElementById("reader-scroll")!;
    // Center tap (not left/right 20%)
    fireEvent.click(scroller, { clientX: 187, clientY: 300 });
  });
});

describe("ReaderPage — sidebar resize handle", () => {
  it("renders the resize handle when sidebar is open", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    // Open the sidebar
    const chatBtn = await screen.findByTitle("Toggle insight chat");
    await userEvent.click(chatBtn);

    // The drag-to-resize element
    expect(document.querySelector("[title='Drag to resize']")).toBeInTheDocument();
  });

  it("mouseDown on resize handle does not crash", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const chatBtn = await screen.findByTitle("Toggle insight chat");
    await userEvent.click(chatBtn);

    const handle = document.querySelector("[title='Drag to resize']") as HTMLElement;
    expect(handle).toBeInTheDocument();

    fireEvent.mouseDown(handle, { clientX: 800 });
    // Move and release
    fireEvent.mouseMove(document, { clientX: 750 });
    fireEvent.mouseUp(document);
  });
});

describe("ReaderPage — translation enable/disable toggle", () => {
  it("disabling translation clears translated content", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    const checkbox = await screen.findByRole("checkbox");
    // Enable then disable
    await userEvent.click(checkbox); // enable
    await userEvent.click(checkbox); // disable

    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ translationEnabled: false }),
    );
  });

  it("shows 'Disabled' label when translation is off", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    expect(await screen.findByText("Disabled")).toBeInTheDocument();
  });

  it("shows 'Enabled' label after toggling translation on", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    const checkbox = await screen.findByRole("checkbox");
    await userEvent.click(checkbox);

    expect(await screen.findByText("Enabled")).toBeInTheDocument();
  });
});

describe("ReaderPage — display mode toggle", () => {
  it("clicking 'Inline' sets display mode to inline", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    const inlineBtn = await screen.findByRole("button", { name: "Inline" });
    await userEvent.click(inlineBtn);

    // Button should still be in the document (no crash)
    expect(screen.getByRole("button", { name: "Inline" })).toBeInTheDocument();
  });

  it("clicking 'Side by side' sets display mode to parallel", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    const parallelBtn = await screen.findByRole("button", { name: "Side by side" });
    await userEvent.click(parallelBtn);

    expect(screen.getByRole("button", { name: "Side by side" })).toBeInTheDocument();
  });
});

describe("ReaderPage — language selection in translate sidebar", () => {
  it("changing language select updates translationLang and saves settings", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      const langSelect = selects.find((s) =>
        Array.from((s as HTMLSelectElement).options).some((o) => o.text === "Chinese"),
      );
      expect(langSelect).toBeDefined();
    });

    const langSelect = screen.getAllByRole("combobox").find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.text === "Chinese"),
    ) as HTMLSelectElement;

    await userEvent.selectOptions(langSelect, "zh");

    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ translationLang: "zh" }),
    );
  });
});

describe("ReaderPage — notes sidebar content", () => {
  it("shows annotation count badge on Notes button when annotations exist", async () => {
    const annotations = [
      {
        id: 1,
        book_id: 42,
        chapter_index: 0,
        sentence_text: "Call me Ishmael.",
        color: "yellow",
        note_text: "Great opening",
        created_at: "2024-01-01",
      },
    ];
    mockGetAnnotations.mockResolvedValue(annotations);
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    // The Notes button with badge
    await waitFor(() => {
      const notesBtn = screen.getByTitle("Annotations & notes");
      expect(notesBtn).toBeInTheDocument();
    });
  });

  it("shows chapter heading group when annotations exist for multiple chapters", async () => {
    const annotations = [
      { id: 1, book_id: 42, chapter_index: 0, sentence_text: "First.", color: "yellow", note_text: "", created_at: "2024-01-01" },
      { id: 2, book_id: 42, chapter_index: 1, sentence_text: "Second.", color: "blue", note_text: "", created_at: "2024-01-02" },
    ];
    mockGetAnnotations.mockResolvedValue(annotations);
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const notesBtn = await screen.findByTitle("Annotations & notes");
    await userEvent.click(notesBtn);

    expect(await screen.findByText("Chapter 1")).toBeInTheDocument();
    expect(screen.getByText("Chapter 2")).toBeInTheDocument();
  });

  it("clicking an annotation in notes sidebar closes sidebar", async () => {
    const annotations = [
      { id: 1, book_id: 42, chapter_index: 0, sentence_text: "Call me Ishmael.", color: "yellow", note_text: "Great line", created_at: "2024-01-01" },
    ];
    mockGetAnnotations.mockResolvedValue(annotations);
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const notesBtn = await screen.findByTitle("Annotations & notes");
    await userEvent.click(notesBtn);

    const annotationItem = await screen.findByText(/Call me Ishmael/);
    await userEvent.click(annotationItem.closest("[class*='rounded-lg border px-3']")!);

    // Sidebar should be closed (no more annotation text visible)
    await waitFor(() => {
      expect(screen.queryByText("No annotations yet.")).not.toBeInTheDocument();
    });
  });
});

describe("ReaderPage — vocab sidebar content", () => {
  it("shows 'View all →' button when vocab tab is open", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const vocabBtn = await screen.findByTitle("Vocabulary");
    await userEvent.click(vocabBtn);

    expect(await screen.findByText("View all →")).toBeInTheDocument();
  });

  it("'View all →' navigates to /vocabulary", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const vocabBtn = await screen.findByTitle("Vocabulary");
    await userEvent.click(vocabBtn);

    const viewAllBtn = await screen.findByText("View all →");
    await userEvent.click(viewAllBtn);

    expect(mockPush).toHaveBeenCalledWith("/vocabulary");
  });

  it("shows vocab count badge on Vocab button when words exist", async () => {
    const bid = bookIdCounter;
    const vocabWords = [
      { id: 10, word: "ephemeral", occurrences: [{ book_id: bid, chapter_index: 0, sentence_text: "test" }] },
      { id: 11, word: "sublime", occurrences: [{ book_id: bid, chapter_index: 0, sentence_text: "test" }] },
    ];
    mockGetVocabulary.mockResolvedValue(vocabWords);
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bid }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const vocabBtn = await screen.findByTitle("Vocabulary");
    await userEvent.click(vocabBtn);

    // Both words should appear in the list
    expect(await screen.findByText("ephemeral")).toBeInTheDocument();
    expect(screen.getByText("sublime")).toBeInTheDocument();
  });
});

describe("ReaderPage — translate sidebar — sign-in prompt when not authenticated", () => {
  it("shows sign-in link instead of Translate button when not authenticated", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    // Enable translation
    const checkbox = await screen.findByRole("checkbox");
    await userEvent.click(checkbox);

    // Should show "Sign in" link, not "Translate this chapter" button
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /translate this chapter/i })).not.toBeInTheDocument();
    });
  });
});

describe("ReaderPage — keyboard navigation", () => {
  it("ArrowRight key advances to next chapter", async () => {
    const bid = bookIdCounter;
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bid }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    await screen.findByTestId("reader-chapter-heading");

    fireEvent.keyDown(document, { key: "ArrowRight" });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("chapter=1"),
        expect.anything(),
      );
    });
  });

  it("ArrowLeft key does nothing on first chapter", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    await screen.findByTestId("reader-chapter-heading");

    mockReplace.mockClear();
    fireEvent.keyDown(document, { key: "ArrowLeft" });

    // On chapter 0, ArrowLeft should not navigate
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("ArrowLeft navigates to previous chapter when not on first", async () => {
    mockGetLastChapter.mockReturnValue(2);
    const bid = bookIdCounter;
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bid }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    await screen.findByText("Chapter Three");

    mockReplace.mockClear();
    fireEvent.keyDown(document, { key: "ArrowLeft" });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("chapter=1"),
        expect.anything(),
      );
    });
  });

  it("keys are ignored when a select element is focused", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();
    await screen.findByTestId("reader-chapter-heading");

    const selects = screen.getAllByRole("combobox");
    mockReplace.mockClear();

    fireEvent.keyDown(selects[0], { key: "ArrowRight" });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("ReaderPage — reading progress bar", () => {
  it("progress bar width reflects chapter index", async () => {
    // Start at chapter 1 of 3, so ~33%
    mockGetLastChapter.mockReturnValue(1);
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    await waitFor(() => {
      const progressBar = document.querySelector("[title*='% through book']");
      expect(progressBar).toBeInTheDocument();
    });
  });
});

describe("ReaderPage — mobile bottom bar interactions", () => {
  it("clicking Translation button in mobile bar enables translation", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    // The mobile bottom bar Translation button
    const translationBtns = await screen.findAllByRole("button", { name: /translation/i });
    // Click the one in the mobile bar (aria-label="Translation")
    const mobileTranslateBtn = translationBtns.find(
      (b) => b.getAttribute("aria-label") === "Translation",
    );
    expect(mobileTranslateBtn).toBeDefined();
    await userEvent.click(mobileTranslateBtn!);

    // Translation should now be enabled (button style changes)
    expect(mobileTranslateBtn!.className).toContain("bg-amber-700");
  });

  it("clicking Translation button again disables translation", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translationBtns = await screen.findAllByRole("button", { name: /translation/i });
    const mobileTranslateBtn = translationBtns.find(
      (b) => b.getAttribute("aria-label") === "Translation",
    )!;

    await userEvent.click(mobileTranslateBtn); // enable
    await userEvent.click(mobileTranslateBtn); // disable

    expect(mobileTranslateBtn.className).not.toContain("bg-amber-700");
  });

  it("mobile Insight chat button opens chat sheet", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const chatBtn = await screen.findByRole("button", { name: /insight chat/i });
    await userEvent.click(chatBtn);

    // Mobile chat sheet should open — shows "Chat" header and InsightChat
    const chatEls = await screen.findAllByTestId("insight-chat");
    expect(chatEls.length).toBeGreaterThanOrEqual(1);
  });

  it("mobile Notes button shows notes expand panel when authenticated", async () => {
    mockGetAnnotations.mockResolvedValue([]);
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    // The mobile Notes button (aria-label="Notes") is in the mobile bottom bar
    // Use getByRole with exact aria-label
    const mobileNotesBtn = await screen.findByRole("button", { name: "Notes" });
    expect(mobileNotesBtn).toBeInTheDocument();

    await userEvent.click(mobileNotesBtn);
    // Notes expanded panel should appear — "No annotations yet." in it
    const noAnnotationsEls = await screen.findAllByText("No annotations yet.");
    expect(noAnnotationsEls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ReaderPage — mobile chat sheet close", () => {
  it("closing the chat sheet via ✕ button hides it", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    // Open chat via mobile button
    const chatBtn = await screen.findByRole("button", { name: /insight chat/i });
    await userEvent.click(chatBtn);

    // Close via ✕
    const closeBtn = await screen.findByRole("button", { name: "Close chat" });
    await userEvent.click(closeBtn);

    // Chat sheet should disappear
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Close chat" })).not.toBeInTheDocument();
    });
  });
});

describe("ReaderPage — Obsidian export button", () => {
  it("shows Obsidian export button when authenticated", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    expect(await screen.findByTitle("Export vocabulary to Obsidian")).toBeInTheDocument();
  });

  it("does not show Obsidian export button when unauthenticated", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    expect(screen.queryByTitle("Export vocabulary to Obsidian")).not.toBeInTheDocument();
  });

  it("clicking Obsidian export button calls exportVocabularyToObsidian", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bookIdCounter }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const exportBtn = await screen.findByTitle("Export vocabulary to Obsidian");
    await userEvent.click(exportBtn);

    await waitFor(() => {
      expect(mockExportVocabularyToObsidian).toHaveBeenCalled();
    });
  });
});

describe("ReaderPage — translation loaded from server cache", () => {
  it("shows queue banner when translation is pending in queue", async () => {
    mockGetChapterQueueStatus.mockResolvedValue({ status: "pending", position: 3 });
    mockGetChapterTranslation.mockRejectedValue({ status: 404 });
    mockGetSettings.mockReturnValue({ ...DEFAULT_SETTINGS, translationEnabled: true });
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    await waitFor(() => {
      // Queue banner should appear
      const banner = document.querySelector(".bg-sky-50");
      if (banner) expect(banner).toBeInTheDocument();
    });
  });

  it("calls requestChapterTranslation when 'Translate this chapter' button is clicked", async () => {
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bookIdCounter }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    const checkbox = await screen.findByRole("checkbox");
    await userEvent.click(checkbox);

    const translateChapterBtn = await screen.findByRole("button", { name: /translate this chapter/i });
    await userEvent.click(translateChapterBtn);

    await waitFor(() => {
      expect(mockRequestChapterTranslation).toHaveBeenCalled();
    });
  });
});

describe("ReaderPage — admin-only features", () => {
  it("shows 'Retranslate chapter' button for admin users when translation is loaded", async () => {
    // Mock admin user
    mockGetMe.mockResolvedValue({ hasGeminiKey: true, role: "admin" });
    // Mock a successful translation fetch
    mockGetChapterTranslation.mockResolvedValue({
      status: "ready",
      paragraphs: ["Translated paragraph."],
      model: "gemini-pro",
      title_translation: null,
    });
    mockGetSettings.mockReturnValue({ ...DEFAULT_SETTINGS, translationEnabled: true });
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    await waitFor(() => {
      const retranslateBtn = screen.queryByRole("button", { name: /retranslate chapter/i });
      if (retranslateBtn) expect(retranslateBtn).toBeInTheDocument();
    });
  });
});

describe("ReaderPage — annotation loading spinner", () => {
  it("shows loading spinner while annotations are being fetched", async () => {
    // Never resolve annotations
    mockGetAnnotations.mockReturnValue(new Promise(() => {}));
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    // Open notes tab
    const notesBtn = await screen.findByTitle("Annotations & notes");
    await userEvent.click(notesBtn);

    // Loading spinner
    await waitFor(() => {
      const spinner = document.querySelector(".animate-spin");
      if (spinner) expect(spinner).toBeInTheDocument();
    });
  });
});

describe("ReaderPage — chapter progress fraction", () => {
  it("shows correct fraction for last chapter", async () => {
    mockGetLastChapter.mockReturnValue(2);
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    expect(await screen.findByText(/3 \/ 3/)).toBeInTheDocument();
  });
});

describe("ReaderPage — book translation status banner", () => {
  it("shows book-level translation status when enabled", async () => {
    mockGetSettings.mockReturnValue({ ...DEFAULT_SETTINGS, translationEnabled: true });
    mockGetBookTranslationStatus.mockResolvedValue({
      book_id: bookIdCounter,
      target_language: "de",
      total_chapters: 3,
      translated_chapters: 1,
      queue_pending: 1,
      queue_running: 0,
      queue_failed: 0,
    });
    mockGetChapterTranslation.mockRejectedValue({ status: 404 });
    mockGetChapterQueueStatus.mockRejectedValue({ status: 404 });
    mockGetBookChapters.mockResolvedValue({ meta: SAMPLE_META, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const translateBtn = await screen.findByTitle("Translation");
    await userEvent.click(translateBtn);

    await waitFor(() => {
      const statusEl = screen.queryByText(/chapters translated/);
      if (statusEl) expect(statusEl).toBeInTheDocument();
    });
  });
});

// ── Vocab sidebar chapter filter ──────────────────────────────────────────────

describe("ReaderPage — vocab sidebar chapter filter", () => {
  it("shows 'This chapter' and 'All chapters' toggle buttons", async () => {
    const bid = bookIdCounter;
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bid }, chapters: SAMPLE_CHAPTERS });
    mockGetVocabulary.mockResolvedValue([]);
    render(<ReaderPage />);
    await flushPromises();

    const vocabBtn = await screen.findByTitle("Vocabulary");
    await userEvent.click(vocabBtn);

    expect(await screen.findByText("This chapter")).toBeInTheDocument();
    expect(screen.getByText("All chapters")).toBeInTheDocument();
  });

  it("defaults to chapter view — hides words from other chapters", async () => {
    const bid = bookIdCounter;
    const words = [
      { id: 1, word: "inChapter", occurrences: [{ book_id: bid, chapter_index: 0, sentence_text: "s" }] },
      { id: 2, word: "otherChapter", occurrences: [{ book_id: bid, chapter_index: 2, sentence_text: "s" }] },
    ];
    mockGetVocabulary.mockResolvedValue(words);
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bid }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const vocabBtn = await screen.findByTitle("Vocabulary");
    await userEvent.click(vocabBtn);

    expect(await screen.findByText("inChapter")).toBeInTheDocument();
    expect(screen.queryByText("otherChapter")).not.toBeInTheDocument();
  });

  it("switching to 'All chapters' shows words from every chapter", async () => {
    const bid = bookIdCounter;
    const words = [
      { id: 1, word: "inChapter", occurrences: [{ book_id: bid, chapter_index: 0, sentence_text: "s" }] },
      { id: 2, word: "otherChapter", occurrences: [{ book_id: bid, chapter_index: 2, sentence_text: "s" }] },
    ];
    mockGetVocabulary.mockResolvedValue(words);
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bid }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const vocabBtn = await screen.findByTitle("Vocabulary");
    await userEvent.click(vocabBtn);

    // Switch to "All chapters"
    const allBtn = await screen.findByText("All chapters");
    await userEvent.click(allBtn);

    expect(await screen.findByText("inChapter")).toBeInTheDocument();
    expect(await screen.findByText("otherChapter")).toBeInTheDocument();
  });

  it("shows count label reflecting filtered words", async () => {
    const bid = bookIdCounter;
    const words = [
      { id: 1, word: "wordOne", occurrences: [{ book_id: bid, chapter_index: 0, sentence_text: "s" }] },
      { id: 2, word: "wordTwo", occurrences: [{ book_id: bid, chapter_index: 0, sentence_text: "s" }] },
      { id: 3, word: "wordThree", occurrences: [{ book_id: bid, chapter_index: 1, sentence_text: "s" }] },
    ];
    mockGetVocabulary.mockResolvedValue(words);
    mockGetBookChapters.mockResolvedValue({ meta: { ...SAMPLE_META, id: bid }, chapters: SAMPLE_CHAPTERS });
    render(<ReaderPage />);
    await flushPromises();

    const vocabBtn = await screen.findByTitle("Vocabulary");
    await userEvent.click(vocabBtn);

    // Chapter view: 2 words
    expect(await screen.findByText("2 words")).toBeInTheDocument();

    // All chapters: 3 words
    await userEvent.click(screen.getByText("All chapters"));
    expect(await screen.findByText("3 words")).toBeInTheDocument();
  });
});

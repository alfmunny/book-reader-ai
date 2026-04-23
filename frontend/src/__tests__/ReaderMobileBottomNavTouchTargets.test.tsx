/**
 * Regression test for #581: mobile bottom nav buttons must be at least 44×44px.
 * The buttons (Translation, Play/Pause, Notes, Insight chat) were w-10 h-10 (40px),
 * below the CLAUDE.md minimum of 44px for mobile touch targets.
 */
import React from "react";
import { render, act } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

jest.mock("next/navigation", () => ({
  useParams: () => ({ bookId: "42" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock("@/lib/api", () => ({
  getBookChapters: jest.fn().mockResolvedValue({
    meta: { id: 42, title: "Test Book", authors: [], languages: [], subjects: [], download_count: 0, cover: "" },
    chapters: [{ title: "Chapter 1", content: "Hello world." }],
  }),
  getMe: jest.fn().mockRejectedValue(new Error("Not authed")),
  getAnnotations: jest.fn().mockResolvedValue([]),
  getVocabulary: jest.fn().mockResolvedValue([]),
  getBookTranslationStatus: jest.fn().mockResolvedValue(null),
  getChapterTranslation: jest.fn().mockResolvedValue(null),
  getChapterQueueStatus: jest.fn().mockResolvedValue(null),
  requestChapterTranslation: jest.fn(),
  retryChapterTranslation: jest.fn(),
  enqueueBookTranslation: jest.fn(),
  deleteTranslationCache: jest.fn(),
  saveReadingProgress: jest.fn(),
  saveVocabularyWord: jest.fn(),
  getWordDefinition: jest.fn(),
  exportVocabularyToObsidian: jest.fn(),
  saveInsight: jest.fn(),
  synthesizeSpeech: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(msg: string, status: number) { super(msg); this.status = status; }
  },
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn().mockReturnValue({
    theme: "light", fontSize: "base", lineHeight: "normal",
    translationLang: "zh", displayMode: "inline", insightLang: "en", chatFontSize: "xs",
  }),
  saveSettings: jest.fn(),
}));

jest.mock("@/lib/recentBooks", () => ({
  recordRecentBook: jest.fn(),
  saveLastChapter: jest.fn(),
  getLastChapter: jest.fn().mockReturnValue(null),
}));

jest.mock("@/components/InsightChat", () => {
  const InsightChat = () => <div data-testid="insight-chat" />;
  const LANGUAGES = [
    { code: "en", label: "English" }, { code: "zh", label: "Chinese" },
    { code: "de", label: "German" }, { code: "fr", label: "French" },
    { code: "es", label: "Spanish" },
  ];
  return { __esModule: true, default: InsightChat, LANGUAGES };
});

jest.mock("@/components/TTSControls", () => ({
  __esModule: true,
  default: () => <div data-testid="tts-controls" />,
}));

jest.mock("@/components/SentenceReader", () => ({
  __esModule: true,
  default: () => <div data-testid="sentence-reader" />,
}));

jest.mock("@/components/SelectionToolbar", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/AnnotationToolbar", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/AnnotationsSidebar", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/TranslationView", () => ({
  __esModule: true,
  default: () => null,
}));

import ReaderPage from "@/app/reader/[bookId]/page";

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

describe("Reader page — mobile bottom nav touch targets (#581)", () => {
  it("mobile bottom nav Translation button is at least 44px (not h-10)", async () => {
    render(<ReaderPage />);
    await act(async () => await flushPromises());

    const btn = document.querySelector('[aria-label="Translation"]');
    expect(btn).not.toBeNull();
    expect(btn!.className).not.toMatch(/\bh-10\b/);
  });

  it("mobile bottom nav Notes button is at least 44px (not h-10)", async () => {
    render(<ReaderPage />);
    await act(async () => await flushPromises());

    const btn = document.querySelector('[aria-label="Notes"]');
    expect(btn).not.toBeNull();
    expect(btn!.className).not.toMatch(/\bh-10\b/);
  });

  it("mobile bottom nav Insight chat button is at least 44px (not h-10)", async () => {
    render(<ReaderPage />);
    await act(async () => await flushPromises());

    const btn = document.querySelector('[aria-label="Insight chat"]');
    expect(btn).not.toBeNull();
    expect(btn!.className).not.toMatch(/\bh-10\b/);
  });

  it("mobile bottom nav Read aloud / Pause button is at least 44px (not h-10)", async () => {
    render(<ReaderPage />);
    await act(async () => await flushPromises());

    const btn = document.querySelector('[aria-label="Read aloud"]') ?? document.querySelector('[aria-label="Pause"]');
    expect(btn).not.toBeNull();
    expect(btn!.className).not.toMatch(/\bh-10\b/);
  });
});

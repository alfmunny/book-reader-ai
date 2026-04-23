/**
 * Regression tests for issue #616 — reader sidebar notes/vocab filter toggle
 * buttons below 44px touch target.
 */
import React from "react";
import { render, act, screen } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { backendToken: "tok", backendUser: { id: 1, name: "User", picture: "" }, user: { id: 1 } },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useParams: () => ({ bookId: "42" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock("@/lib/api", () => ({
  getBookChapters: jest.fn().mockResolvedValue({
    meta: { id: 42, title: "Moby Dick", authors: [], languages: [], subjects: [], download_count: 0, cover: "" },
    chapters: [{ title: "Chapter 1", text: "Call me Ishmael." }],
  }),
  getMe: jest.fn().mockResolvedValue({ id: 1, name: "User" }),
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

jest.mock("@/components/TTSControls", () => ({ __esModule: true, default: () => <div data-testid="tts-controls" /> }));
jest.mock("@/components/SentenceReader", () => ({ __esModule: true, default: () => <div data-testid="sentence-reader" /> }));
jest.mock("@/components/SelectionToolbar", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/AnnotationToolbar", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/AnnotationsSidebar", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/TranslationView", () => ({ __esModule: true, default: () => null }));

import ReaderPage from "@/app/reader/[bookId]/page";

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

async function renderAndOpenNotes() {
  render(<ReaderPage />);
  await act(async () => await flushPromises());

  // Click the desktop Notes sidebar toggle button
  const notesBtn = document.querySelector('[title="Annotations & notes"]') as HTMLElement | null;
  if (notesBtn) {
    await act(async () => { notesBtn.click(); });
  }
  await act(async () => await flushPromises());
}

async function renderAndOpenVocab() {
  render(<ReaderPage />);
  await act(async () => await flushPromises());

  // Click the desktop Vocab sidebar toggle button
  const vocabBtn = document.querySelector('[title="Vocabulary"]') as HTMLElement | null;
  if (vocabBtn) {
    await act(async () => { vocabBtn.click(); });
  }
  await act(async () => await flushPromises());
}

afterEach(() => jest.clearAllMocks());

test("Notes sidebar 'This chapter' filter button has min-h-[44px]", async () => {
  await renderAndOpenNotes();

  const btn = screen.queryByRole("button", { name: "This chapter" });
  expect(btn).not.toBeNull();
  expect(btn!.className).toContain("min-h-[44px]");
});

test("Notes sidebar 'All chapters' filter button has min-h-[44px]", async () => {
  await renderAndOpenNotes();

  const btn = screen.queryByRole("button", { name: "All chapters" });
  expect(btn).not.toBeNull();
  expect(btn!.className).toContain("min-h-[44px]");
});

test("Vocab sidebar 'This chapter' filter button has min-h-[44px]", async () => {
  await renderAndOpenVocab();

  const btn = screen.queryByRole("button", { name: "This chapter" });
  expect(btn).not.toBeNull();
  expect(btn!.className).toContain("min-h-[44px]");
});

test("Vocab sidebar 'All chapters' filter button has min-h-[44px]", async () => {
  await renderAndOpenVocab();

  const btn = screen.queryByRole("button", { name: "All chapters" });
  expect(btn).not.toBeNull();
  expect(btn!.className).toContain("min-h-[44px]");
});

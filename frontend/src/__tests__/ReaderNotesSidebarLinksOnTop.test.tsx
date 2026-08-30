/**
 * The reader's Notes sidebar puts its "Book notes" / "All books" jump links at
 * the top of the panel, not below the annotation list — with a long list the
 * footer links sat off-screen until you scrolled to the very bottom.
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
  listPublishedSessions: jest.fn().mockResolvedValue([]),
  getParagraphNoteCounts: jest.fn().mockResolvedValue({ counts: {} }),
  getBookTranslationLanguages: jest.fn().mockResolvedValue({ book_id: 1, total_chapters: 0, languages: [] }),
  listTranslationSessions: jest.fn().mockResolvedValue([]),
  getSessionChapter: jest.fn().mockResolvedValue({ session_id: 1, chapter_index: 0, paragraph_count: 0, paragraphs: {} }),
  translateSession: jest.fn(),
  editSessionParagraph: jest.fn(),
  deleteSessionParagraph: jest.fn(),
  getBookChapters: jest.fn().mockResolvedValue({
    meta: { id: 42, title: "Moby Dick", authors: [], languages: [], subjects: [], download_count: 0, cover: "" },
    chapters: [{ title: "Chapter 1", text: "Call me Ishmael." }],
  }),
  getMe: jest.fn().mockResolvedValue({ id: 1, name: "User" }),
  getAnnotations: jest.fn().mockResolvedValue([
    { id: 1, book_id: 42, chapter_index: 0, sentence_text: "Call me Ishmael.", note_text: "Famous.", color: "yellow" },
  ]),
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
  const LANGUAGES = [{ code: "en", label: "English" }, { code: "zh", label: "Chinese" }];
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
  const notesBtn = document.querySelector('[title="Annotations & notes"]') as HTMLElement | null;
  if (notesBtn) await act(async () => { notesBtn.click(); });
  await act(async () => await flushPromises());
}

/** True when `later` sits after `earlier` in document order. */
function comesAfter(earlier: Element, later: Element): boolean {
  return Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
}

test("the 'Book notes' link sits above the chapter filter and the annotation list", async () => {
  await renderAndOpenNotes();

  const link = document.querySelector('a[href="/notes/42"]');
  const filter = screen.getByRole("button", { name: "This chapter" });
  const list = screen.getByRole("list", { name: "Annotations" });

  expect(link).not.toBeNull();
  expect(comesAfter(link!, filter)).toBe(true);
  expect(comesAfter(link!, list)).toBe(true);
});

test("the 'All books' link sits above the chapter filter", async () => {
  await renderAndOpenNotes();

  const link = document.querySelector('a[href="/notes"]');
  const filter = screen.getByRole("button", { name: "This chapter" });

  expect(link).not.toBeNull();
  expect(comesAfter(link!, filter)).toBe(true);
});

test("both jump links are still present and keep their targets", async () => {
  await renderAndOpenNotes();

  expect(document.querySelector('a[href="/notes/42"]')?.textContent).toMatch(/Book notes/);
  expect(document.querySelector('a[href="/notes"]')?.textContent).toMatch(/All books/);
});

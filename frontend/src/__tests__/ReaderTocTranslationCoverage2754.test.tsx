/**
 * The Contents panel marks which chapters have a translation (#2754).
 *
 * TableOfContents has supported this since #2746, but nothing passed the prop,
 * so the dot never rendered. These tests guard the wiring, not the component.
 */
import React from "react";
import { render, act, screen, within } from "@testing-library/react";

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
    chapters: [
      { title: "Loomings", text: "Call me Ishmael." },
      { title: "The Carpet-Bag", text: "I stuffed a shirt." },
      { title: "The Spouter-Inn", text: "Entering that gable-ended." },
    ],
  }),
  getMe: jest.fn().mockResolvedValue({ id: 1, name: "User" }),
  getAnnotations: jest.fn().mockResolvedValue([]),
  getVocabulary: jest.fn().mockResolvedValue([]),
  getBookTranslationStatus: jest.fn(),
  getBookTranslationLanguages: jest.fn().mockResolvedValue({ languages: [] }),
  getChapterTranslation: jest.fn().mockResolvedValue(null),
  saveReadingProgress: jest.fn(),
  saveVocabularyWord: jest.fn(),
  getWordDefinition: jest.fn(),
  exportVocabularyToObsidian: jest.fn(),
  saveInsight: jest.fn(),
  createAnnotation: jest.fn(),
  synthesizeSpeech: jest.fn(),
  listTranslationSessions: jest.fn().mockResolvedValue([]),
  getSessionChapter: jest.fn(),
  translateSession: jest.fn(),
  editSessionParagraph: jest.fn(),
  deleteSessionParagraph: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(msg: string, status: number) { super(msg); this.status = status; }
  },
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn().mockReturnValue({
    theme: "light", fontSize: "base", lineHeight: "normal",
    translationLang: "zh", displayMode: "inline", insightLang: "en", chatFontSize: "xs",
    translationEnabled: true,
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
  return { __esModule: true, default: InsightChat, LANGUAGES: [{ code: "zh", label: "Chinese" }] };
});
jest.mock("@/components/TTSControls", () => ({ __esModule: true, default: () => <div /> }));
jest.mock("@/components/SentenceReader", () => ({ __esModule: true, default: () => <div /> }));
jest.mock("@/components/SelectionToolbar", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/AnnotationToolbar", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/AnnotationsSidebar", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/TranslationView", () => ({ __esModule: true, default: () => null }));

import * as api from "@/lib/api";
import ReaderPage from "@/app/reader/[bookId]/page";

const mockStatus = api.getBookTranslationStatus as jest.MockedFunction<typeof api.getBookTranslationStatus>;
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function status(translated_indices?: number[]) {
  return {
    book_id: 42, target_language: "zh", total_chapters: 3,
    translated_chapters: translated_indices?.length ?? 0,
    bulk_active: false,
    ...(translated_indices ? { translated_indices } : {}),
  } as never;
}

async function openContents() {
  render(<ReaderPage />);
  await act(async () => { await flush(); });
  const btn = document.querySelector('[title="Table of contents"]') as HTMLElement | null;
  if (btn) await act(async () => { btn.click(); });
  await act(async () => { await flush(); });
  // The desktop sidebar and the mobile sheet both mount the panel, so every
  // row exists twice in jsdom. Scope assertions to one of them.
  return within(screen.getAllByRole("navigation", { name: /table of contents/i })[0]);
}

afterEach(() => jest.clearAllMocks());

test("marks translated and untranslated chapters in the accessible name", async () => {
  mockStatus.mockResolvedValue(status([0, 2]));
  const toc = await openContents();

  expect(toc.getByRole("button", { name: "1. Loomings. Translated" })).toBeInTheDocument();
  expect(toc.getByRole("button", { name: "2. The Carpet-Bag. Not translated" })).toBeInTheDocument();
  expect(toc.getByRole("button", { name: "3. The Spouter-Inn. Translated" })).toBeInTheDocument();
});

test("says nothing about translation when the API omits coverage", async () => {
  // An older backend, or a failed fetch — the panel must not guess.
  mockStatus.mockResolvedValue(status(undefined));
  const toc = await openContents();

  expect(toc.getByRole("button", { name: "1. Loomings" })).toBeInTheDocument();
});

test("says nothing about translation when the status fetch fails", async () => {
  mockStatus.mockRejectedValue(new Error("offline"));
  const toc = await openContents();

  expect(toc.getByRole("button", { name: "1. Loomings" })).toBeInTheDocument();
});

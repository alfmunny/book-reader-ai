/**
 * The Contents panel collapses front matter out of the reading path (#2755).
 *
 * TableOfContents has supported the group since #2746; nothing passed `roles`,
 * so it never appeared. These tests guard the wiring, not the component.
 */
import React from "react";
import { render, act, screen, within, fireEvent } from "@testing-library/react";

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
  getParagraphNoteCounts: jest.fn().mockResolvedValue({ counts: {} }),
  getBookChapters: jest.fn().mockResolvedValue({
    meta: { id: 42, title: "Moby Dick", authors: [], languages: [], subjects: [], download_count: 0, cover: "" },
    chapters: [
      { title: "Contents", text: "i. Loomings", role: "frontmatter" },
      { title: "Loomings", text: "Call me Ishmael.", role: null },
      { title: "The Carpet-Bag", text: "I stuffed a shirt.", role: null },
    ],
  }),
  getMe: jest.fn().mockResolvedValue({ id: 1, name: "User" }),
  getAnnotations: jest.fn().mockResolvedValue([]),
  getVocabulary: jest.fn().mockResolvedValue([]),
  getBookTranslationStatus: jest.fn().mockRejectedValue(new Error("not under test")),
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
  // Start past the front matter. On chapter 0 the panel deliberately opens
  // the group instead — it never hides where the reader currently is.
  getLastChapter: jest.fn().mockReturnValue(1),
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

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

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

test("collapses front matter behind a group instead of listing it inline", async () => {
  const toc = await openContents();

  expect(toc.getByRole("button", { name: /front matter/i })).toHaveAttribute("aria-expanded", "false");
  expect(toc.queryByRole("button", { name: "1. Contents" })).not.toBeInTheDocument();
  expect(toc.getByRole("button", { name: "2. Loomings" })).toBeInTheDocument();
});

test("front matter stays reachable — expanding the group reveals it", async () => {
  const toc = await openContents();

  fireEvent.click(toc.getByRole("button", { name: /front matter/i }));

  expect(toc.getByRole("button", { name: "1. Contents" })).toBeInTheDocument();
});

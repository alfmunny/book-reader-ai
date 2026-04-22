/**
 * Additional coverage tests for /notes/[bookId] page.
 * Targets: buildMarkdown, handleExport, chapter view, unauthenticated redirect,
 * nested collapse, book-level insights, vocab in chapter view, "Open reader" button.
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useParams: () => ({ bookId: "10" }),
}));

jest.mock("@/lib/api", () => ({
  getBookChapters: jest.fn(),
  getAnnotations: jest.fn(),
  getInsights: jest.fn(),
  getVocabulary: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
  deleteInsight: jest.fn(),
  exportVocabularyToObsidian: jest.fn(),
}));

import * as api from "@/lib/api";
import { useSession } from "next-auth/react";
import BookNotesPage, { buildMarkdown } from "@/app/notes/[bookId]/page";
import type { Annotation, BookInsight, VocabularyWord, BookChapter, BookMeta } from "@/lib/api";

const mockUseSession = useSession as jest.Mock;
const mockGetBookChapters = api.getBookChapters as jest.MockedFunction<typeof api.getBookChapters>;
const mockGetAnnotations = api.getAnnotations as jest.MockedFunction<typeof api.getAnnotations>;
const mockGetInsights = api.getInsights as jest.MockedFunction<typeof api.getInsights>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;
const mockExportVocabularyToObsidian = api.exportVocabularyToObsidian as jest.MockedFunction<typeof api.exportVocabularyToObsidian>;

const META: BookMeta = {
  id: 10, title: "Moby Dick", authors: ["Herman Melville"],
  languages: ["en"], subjects: [], download_count: 0, cover: null,
};
const CHAPTERS: BookChapter[] = [
  { title: "Chapter 1", text: "" },
  { title: "Chapter 2", text: "" },
];
const CHAPTERS_RESP = { book_id: 10, meta: META, chapters: CHAPTERS };

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return { id: 1, book_id: 10, chapter_index: 0, sentence_text: "Call me Ishmael.", note_text: "Famous.", color: "yellow", ...overrides };
}
function makeInsight(overrides: Partial<BookInsight> = {}): BookInsight {
  return { id: 1, book_id: 10, chapter_index: 0, question: "What is Moby Dick?", answer: "A whale.", context_text: null, created_at: "2026-01-01T00:00:00", ...overrides };
}
function makeVocab(overrides: Partial<VocabularyWord> = {}): VocabularyWord {
  return { id: 1, word: "leviathan", occurrences: [{ book_id: 10, book_title: "Moby Dick", chapter_index: 0, sentence_text: "The great leviathan." }], ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({ data: { backendToken: "tok" }, status: "authenticated" });
  mockGetBookChapters.mockResolvedValue(CHAPTERS_RESP as any);
  mockGetAnnotations.mockResolvedValue([]);
  mockGetInsights.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
  jest.spyOn(window, "confirm").mockReturnValue(true);
});

// ── buildMarkdown — unit tests ─────────────────────────────────────────────────

describe("buildMarkdown — section mode", () => {
  it("outputs title and author header", () => {
    const md = buildMarkdown("section", META, CHAPTERS, [], [], [], 10);
    expect(md).toContain("# Moby Dick");
    expect(md).toContain("*Herman Melville*");
  });

  it("omits author line when no authors", () => {
    const metaNoAuth: BookMeta = { ...META, authors: [] };
    const md = buildMarkdown("section", metaNoAuth, CHAPTERS, [], [], [], 10);
    expect(md).not.toContain("*");
  });

  it("renders annotation section with chapter heading and quote", () => {
    const ann = makeAnnotation({ note_text: "My note." });
    const md = buildMarkdown("section", META, CHAPTERS, [ann], [], [], 10);
    expect(md).toContain("## Annotations");
    expect(md).toContain("### Chapter 1");
    expect(md).toContain('"Call me Ishmael."');
    expect(md).toContain("My note.");
  });

  it("skips annotation note_text when empty", () => {
    const ann = makeAnnotation({ note_text: "" });
    const md = buildMarkdown("section", META, CHAPTERS, [ann], [], [], 10);
    expect(md).toContain("## Annotations");
    expect(md).not.toContain("Famous.");
  });

  it("renders insight section with Q/A", () => {
    const ins = makeInsight({ context_text: "The pale whale loomed." });
    const md = buildMarkdown("section", META, CHAPTERS, [], [ins], [], 10);
    expect(md).toContain("## AI Insights");
    expect(md).toContain("**Q:** What is Moby Dick?");
    expect(md).toContain("**A:** A whale.");
    expect(md).toContain('"The pale whale loomed."');
  });

  it("renders book-level insights under 'Book-level' heading", () => {
    const bookIns = makeInsight({ chapter_index: null as any });
    const md = buildMarkdown("section", META, CHAPTERS, [], [bookIns], [], 10);
    expect(md).toContain("### Book-level");
  });

  it("renders chapter-level insights under chapter heading", () => {
    const chIns = makeInsight({ chapter_index: 1, question: "Ch2 Q?", answer: "Ch2 A." });
    const md = buildMarkdown("section", META, CHAPTERS, [], [chIns], [], 10);
    expect(md).toContain("### Chapter 2");
    expect(md).toContain("**Q:** Ch2 Q?");
  });

  it("renders vocabulary section", () => {
    const vocab = makeVocab();
    const md = buildMarkdown("section", META, CHAPTERS, [], [], [vocab], 10);
    expect(md).toContain("## Vocabulary");
    expect(md).toContain("**leviathan**");
  });

  it("filters vocab to current book only", () => {
    const otherBookVocab: VocabularyWord = {
      id: 2, word: "foreign", occurrences: [{ book_id: 99, book_title: "Other", chapter_index: 0, sentence_text: "s" }],
    };
    const md = buildMarkdown("section", META, CHAPTERS, [], [], [otherBookVocab], 10);
    expect(md).not.toContain("## Vocabulary");
    expect(md).not.toContain("foreign");
  });

  it("uses chapter title when available", () => {
    const namedChapters: BookChapter[] = [{ title: "The Loom of Time", text: "" }];
    const ann = makeAnnotation({ chapter_index: 0 });
    const md = buildMarkdown("section", META, namedChapters, [ann], [], [], 10);
    expect(md).toContain("### The Loom of Time");
  });

  it("uses 'Chapter N' fallback when title matches default pattern", () => {
    const ann = makeAnnotation({ chapter_index: 0 });
    const md = buildMarkdown("section", META, CHAPTERS, [ann], [], [], 10);
    expect(md).toContain("### Chapter 1");
  });

  it("truncates long context_text to 200 chars in insights", () => {
    const longCtx = "A".repeat(250);
    const ins = makeInsight({ context_text: longCtx });
    const md = buildMarkdown("section", META, CHAPTERS, [], [ins], [], 10);
    expect(md).toContain("…");
    expect(md).not.toContain("A".repeat(250));
  });
});

describe("buildMarkdown — chapter mode", () => {
  it("groups items under chapter heading", () => {
    const ann = makeAnnotation({ chapter_index: 0 });
    const ins = makeInsight({ chapter_index: 1, question: "Q2?", answer: "A2." });
    const md = buildMarkdown("chapter", META, CHAPTERS, [ann], [ins], [], 10);
    expect(md).toContain("## Chapter 1");
    expect(md).toContain("## Chapter 2");
    expect(md).toContain('"Call me Ishmael."');
    expect(md).toContain("**Q:** Q2?");
  });

  it("renders vocab words under chapter section", () => {
    const vocab = makeVocab({ occurrences: [{ book_id: 10, book_title: "Moby Dick", chapter_index: 0, sentence_text: "The great leviathan." }] });
    const md = buildMarkdown("chapter", META, CHAPTERS, [], [], [vocab], 10);
    expect(md).toContain("**Words:**");
    expect(md).toContain("**leviathan**");
  });

  it("renders book-level insights at end", () => {
    const bookIns = makeInsight({ chapter_index: null as any, question: "Overall Q?", answer: "Overall A." });
    const md = buildMarkdown("chapter", META, CHAPTERS, [], [bookIns], [], 10);
    expect(md).toContain("## Book-level Insights");
    expect(md).toContain("**Q:** Overall Q?");
  });

  it("returns just the header for empty data", () => {
    const md = buildMarkdown("chapter", META, CHAPTERS, [], [], [], 10);
    expect(md).toContain("# Moby Dick");
    expect(md).not.toContain("## Chapter");
  });
});

// ── handleExport ───────────────────────────────────────────────────────────────

test("export button calls exportVocabularyToObsidian and shows success", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  mockExportVocabularyToObsidian.mockResolvedValue({ urls: ["https://github.com/example/1"] });
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  fireEvent.click(screen.getByRole("button", { name: /Export/i }));
  await waitFor(() => expect(mockExportVocabularyToObsidian).toHaveBeenCalledWith(10));
  await waitFor(() => expect(screen.getByText(/Exported → https:/)).toBeInTheDocument());
});

test("export shows 'Exported successfully' when no URL returned", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  mockExportVocabularyToObsidian.mockResolvedValue({ urls: [] });
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  fireEvent.click(screen.getByRole("button", { name: /Export/i }));
  await waitFor(() => expect(screen.getByText("Exported successfully")).toBeInTheDocument());
});

test("export shows error message on failure", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  mockExportVocabularyToObsidian.mockRejectedValue(new Error("Vault not found"));
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  fireEvent.click(screen.getByRole("button", { name: /Export/i }));
  await waitFor(() => expect(screen.getByText("Vault not found")).toBeInTheDocument());
});

// ── Unauthenticated redirect ───────────────────────────────────────────────────

test("unauthenticated user is redirected to /login", () => {
  mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
  render(<BookNotesPage />);
  expect(mockReplace).toHaveBeenCalledWith("/login");
});

// ── Chapter view with vocab and book-level insights ───────────────────────────

test("chapter view renders vocab words under chapter heading", async () => {
  mockGetAnnotations.mockResolvedValue([]);
  mockGetInsights.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([makeVocab()]);
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getAllByText(/leviathan/i).length).toBeGreaterThan(0));

  fireEvent.click(screen.getByRole("button", { name: "By chapter" }));
  expect(screen.getAllByText(/leviathan/i).length).toBeGreaterThan(0);
});

test("chapter view renders book-level insights in a separate section", async () => {
  mockGetAnnotations.mockResolvedValue([]);
  mockGetInsights.mockResolvedValue([makeInsight({ chapter_index: null as any, question: "Overall?" })]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Overall\?/));

  fireEvent.click(screen.getByRole("button", { name: "By chapter" }));
  expect(screen.getByRole("button", { name: /Book-level Insights/i })).toBeInTheDocument();
});

// ── Section view with multiple annotation chapters ─────────────────────────────

test("section view groups annotations by chapter with sub-headings", async () => {
  mockGetAnnotations.mockResolvedValue([
    makeAnnotation({ id: 1, chapter_index: 0, sentence_text: "First chapter text." }),
    makeAnnotation({ id: 2, chapter_index: 1, sentence_text: "Second chapter text." }),
  ]);
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByText(/First chapter text/)).toBeInTheDocument());
  expect(screen.getByText(/Second chapter text/)).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Chapter 1/i }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: /Chapter 2/i }).length).toBeGreaterThan(0);
});

test("section view with book-level insight shows Book-level sub-heading", async () => {
  mockGetAnnotations.mockResolvedValue([]);
  mockGetInsights.mockResolvedValue([makeInsight({ chapter_index: null as any, question: "Book overview?" })]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Book overview\?/));
  expect(screen.getByRole("button", { name: /Book-level/i })).toBeInTheDocument();
});

// ── "Open reader" button ───────────────────────────────────────────────────────

test("'Open reader' button on empty state navigates to reader", async () => {
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/No notes yet/i));
  fireEvent.click(screen.getByRole("button", { name: /Open reader/i }));
  expect(mockPush).toHaveBeenCalledWith("/reader/10");
});

// ── Nested collapse ────────────────────────────────────────────────────────────

test("collapsing a chapter sub-heading hides its annotations", async () => {
  mockGetAnnotations.mockResolvedValue([
    makeAnnotation({ chapter_index: 0, sentence_text: "Sub chapter text." }),
  ]);
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getByText(/Sub chapter text/)).toBeInTheDocument());

  // The annotations section has a Chapter 1 sub-heading button — click it to collapse
  const ch1Btns = screen.getAllByRole("button", { name: /Chapter 1/i });
  fireEvent.click(ch1Btns[ch1Btns.length - 1]); // innermost Chapter 1 button
  expect(screen.queryByText(/Sub chapter text/)).not.toBeInTheDocument();
});

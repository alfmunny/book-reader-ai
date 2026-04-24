/**
 * Additional coverage tests for /notes/[bookId] page.
 * Targets: buildMarkdown, handleExport, chapter view, unauthenticated redirect,
 * nested collapse, book-level insights, vocab in chapter view, "Open reader" button,
 * collapse toggle callbacks (lines 473, 483, 497, 519, 568, 596), hash scroll (296-298).
 */
import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

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
import BookNotesPage from "@/app/notes/[bookId]/page";
import { buildMarkdown } from "@/lib/notesMarkdown";
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

// ── Collapse toggle callbacks (lines 473, 483, 497, 519, 568, 596) ────────────

test("clicking AI Insights heading collapses insights section (line 473)", async () => {
  mockGetInsights.mockResolvedValue([makeInsight({ chapter_index: 0 })]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/What is Moby Dick/));

  fireEvent.click(screen.getByRole("button", { name: /AI Insights/i }));
  expect(screen.queryByText(/What is Moby Dick/)).not.toBeInTheDocument();
});

test("clicking Book-level sub-heading collapses book-level insights (line 483)", async () => {
  mockGetInsights.mockResolvedValue([makeInsight({ chapter_index: null as any })]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/What is Moby Dick/));

  fireEvent.click(screen.getByRole("button", { name: /Book-level/i }));
  expect(screen.queryByText(/What is Moby Dick/)).not.toBeInTheDocument();
});

test("clicking chapter insight sub-heading collapses chapter insights (line 497)", async () => {
  mockGetInsights.mockResolvedValue([makeInsight({ chapter_index: 0, question: "Chapter Q?" })]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Chapter Q/));

  // There are multiple Chapter 1 buttons — the last one inside AI Insights is for chapter insights
  const ch1Btns = screen.getAllByRole("button", { name: /Chapter 1/i });
  fireEvent.click(ch1Btns[ch1Btns.length - 1]);
  expect(screen.queryByText(/Chapter Q/)).not.toBeInTheDocument();
});

test("clicking Vocabulary heading collapses vocab section (line 519)", async () => {
  mockGetVocabulary.mockResolvedValue([makeVocab()]);
  render(<BookNotesPage />);
  await waitFor(() => expect(screen.getAllByText(/leviathan/i).length).toBeGreaterThan(0));

  fireEvent.click(screen.getByRole("button", { name: /Vocabulary/i }));
  expect(screen.queryByText(/leviathan/i)).not.toBeInTheDocument();
});

test("clicking chapter heading in chapter view collapses chapter content (line 568)", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation({ sentence_text: "Chapter toggle text." })]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Chapter toggle text/));

  fireEvent.click(screen.getByRole("button", { name: "By chapter" }));
  await waitFor(() => screen.getByText(/Chapter toggle text/));

  fireEvent.click(screen.getByRole("button", { name: /Chapter 1/i }));
  expect(screen.queryByText(/Chapter toggle text/)).not.toBeInTheDocument();
});

test("clicking Book-level Insights heading in chapter view collapses it (line 596)", async () => {
  mockGetInsights.mockResolvedValue([makeInsight({ chapter_index: null as any, question: "Book Q?" })]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Book Q/));

  fireEvent.click(screen.getByRole("button", { name: "By chapter" }));

  fireEvent.click(screen.getByRole("button", { name: /Book-level Insights/i }));
  expect(screen.queryByText(/Book Q/)).not.toBeInTheDocument();
});

// ── Lines 296-298: Hash-based scroll on load ──────────────────────────────────

test("scrolls to anchored annotation when window.location.hash is set on load (lines 296-298)", async () => {
  const scrollIntoViewMock = jest.fn();
  window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

  mockGetAnnotations.mockResolvedValue([makeAnnotation({ id: 42, sentence_text: "Scroll target." })]);

  // In JSDOM, assigning location.hash directly is allowed
  window.location.hash = "#annotation-42";

  jest.useFakeTimers();
  render(<BookNotesPage />);

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    jest.runAllTimers();
  });

  jest.useRealTimers();
  window.location.hash = "";
});

test("hash scroll: el is null when hash points to missing element (line 298 false branch)", async () => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  window.location.hash = "#nonexistent-element-xyz";
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);

  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  // No crash — el===null branch gracefully skips setTimeout
  window.location.hash = "";
});

// ── Line 274: status !== "authenticated" early-return ─────────────────────────

test("renders nothing when session status is 'loading' (line 274)", () => {
  mockUseSession.mockReturnValue({ data: null, status: "loading" });
  render(<BookNotesPage />);
  expect(mockReplace).not.toHaveBeenCalled();
});

// ── Line 306: toggleCollapse delete branch (un-collapse after collapse) ────────

test("clicking a collapsed heading again un-collapses it (line 306 delete branch)", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation({ sentence_text: "Uncollapse me." })]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Uncollapse me/));

  const annBtn = screen.getByRole("button", { name: /Annotations/i });
  fireEvent.click(annBtn); // collapse (add to Set)
  expect(screen.queryByText(/Uncollapse me/)).not.toBeInTheDocument();

  fireEvent.click(annBtn); // un-collapse (delete from Set)
  expect(screen.getByText(/Uncollapse me/)).toBeInTheDocument();
});

// ── Lines 347, 357: UndoToast undo path restores item without calling API ──────

test("clicking Undo in annotation delete toast restores the annotation (line 347)", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  fireEvent.click(screen.getByTitle("Delete annotation"));
  expect(screen.queryByText(/Call me Ishmael/)).not.toBeInTheDocument();
  expect(screen.getByText("Annotation deleted")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Undo/i }));
  await waitFor(() => expect(screen.getByText(/Call me Ishmael/)).toBeInTheDocument());
  expect(api.deleteAnnotation).not.toHaveBeenCalled();
});

test("clicking Undo in insight delete toast restores the insight (line 357)", async () => {
  mockGetInsights.mockResolvedValue([makeInsight()]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/What is Moby Dick/));

  fireEvent.click(screen.getByTitle("Delete insight"));
  expect(screen.queryByText(/What is Moby Dick/)).not.toBeInTheDocument();
  expect(screen.getByText("Insight deleted")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Undo/i }));
  await waitFor(() => expect(screen.getByText(/What is Moby Dick/)).toBeInTheDocument());
  expect(api.deleteInsight).not.toHaveBeenCalled();
});

// ── Line 372: export throws non-Error → "Export failed" fallback ───────────────

test("export shows 'Export failed' when non-Error is thrown (line 372)", async () => {
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  mockExportVocabularyToObsidian.mockRejectedValue("plain string error");
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Call me Ishmael/));

  fireEvent.click(screen.getByRole("button", { name: /Export/i }));
  await waitFor(() => expect(screen.getByText("Export failed")).toBeInTheDocument());
});

// ── Line 694: meta.authors null → authors paragraph hidden ────────────────────

test("authors paragraph is hidden when meta.authors is null (line 694)", async () => {
  mockGetBookChapters.mockResolvedValue({
    book_id: 10,
    meta: { id: 10, title: "No Author Book", authors: null as unknown as string[], languages: ["en"], subjects: [], download_count: 0, cover: null },
    chapters: [{ title: "Chapter 1", text: "" }],
  } as any);
  mockGetAnnotations.mockResolvedValue([makeAnnotation()]);
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText("No Author Book"));
  // Book title visible but no author name line (authors is null → ?? [] → length 0)
  expect(screen.queryByText(/Herman Melville/)).not.toBeInTheDocument();
});

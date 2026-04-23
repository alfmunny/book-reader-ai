/**
 * VocabularyPage — coverage2: remaining uncovered lines
 *   Lines 59-62: DefinitionSheet mousedown-outside listener (setTimeout 100ms)
 *   Line 174:    highlightRef.scrollIntoView inside setTimeout 200ms
 *   Line 314:    alternateForms.map display
 */

import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "tok" } }),
}));

const mockGetParam = jest.fn().mockReturnValue(null);
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: mockGetParam }),
}));

jest.mock("@/lib/api", () => ({
  getVocabulary: jest.fn(),
  deleteVocabularyWord: jest.fn(),
  exportVocabularyToObsidian: jest.fn(),
  getWordDefinition: jest.fn(),
  listVocabularyTags: jest.fn().mockResolvedValue([]),
  getVocabularyWordTags: jest.fn().mockResolvedValue([]),
  addVocabularyWordTag: jest.fn().mockResolvedValue({ tag: "" }),
  removeVocabularyWordTag: jest.fn().mockResolvedValue(undefined),
  ApiError: class ApiError extends Error { status = 500; },
}));

import * as api from "@/lib/api";
import VocabularyPage from "@/app/vocabulary/page";

const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;
const mockGetWordDefinition = api.getWordDefinition as jest.MockedFunction<typeof api.getWordDefinition>;

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

const WORD_WITH_FORMS = [
  {
    id: 1,
    word: "run",
    lemma: "run",
    language: "en",
    occurrences: [{ book_id: 1, book_title: "B1", chapter_index: 0, sentence_text: "He can run." }],
  },
  {
    id: 2,
    word: "running",
    lemma: "run",
    language: "en",
    occurrences: [{ book_id: 1, book_title: "B1", chapter_index: 1, sentence_text: "She was running." }],
  },
];

const ONE_WORD = [
  {
    id: 10,
    word: "ephemeral",
    lemma: "ephemeral",
    language: "en",
    occurrences: [{ book_id: 1, book_title: "Moby Dick", chapter_index: 0, sentence_text: "…" }],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetParam.mockReturnValue(null);
  mockGetVocabulary.mockResolvedValue(ONE_WORD);
  mockGetWordDefinition.mockResolvedValue({
    lemma: "ephemeral",
    language: "en",
    definitions: [{ pos: "adj", text: "short-lived" }],
    url: "",
  });
});

// ── Line 314: alternateForms.map ──────────────────────────────────────────────

describe("VocabularyPage — alternate forms display (line 314)", () => {
  it("shows alternate word forms in parentheses when same lemma has multiple forms", async () => {
    mockGetVocabulary.mockResolvedValue(WORD_WITH_FORMS);

    render(<VocabularyPage />);
    await act(async () => await flushPromises());

    await screen.findByText("run");

    // "running" is an alternate form of "run" — should appear in parentheses
    expect(screen.getByText("(running)")).toBeInTheDocument();
  });

  it("does not show parentheses when all forms match the lemma", async () => {
    mockGetVocabulary.mockResolvedValue(ONE_WORD);

    render(<VocabularyPage />);
    await act(async () => await flushPromises());

    await screen.findByText("ephemeral");

    // No alternate forms, no parentheses span
    const parens = screen.queryByText(/\(.*\)/);
    expect(parens).not.toBeInTheDocument();
  });
});

// ── Lines 59-62: DefinitionSheet mousedown-outside closes sheet ───────────────

describe("VocabularyPage — DefinitionSheet mousedown outside (lines 59-62)", () => {
  it("closes the sheet when mousedown fires outside after 100ms delay", async () => {
    render(<VocabularyPage />);
    await act(async () => await flushPromises());
    await screen.findByText("ephemeral");

    await userEvent.click(screen.getByRole("button", { name: /ephemeral/i }));
    await waitFor(() => expect(screen.getByText("short-lived")).toBeInTheDocument());

    // Wait 110ms for the setTimeout(100) mousedown listener to register
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 110));
    });

    // Fire mousedown on document.body (outside the sheet)
    fireEvent.mouseDown(document.body);

    await waitFor(() =>
      expect(screen.queryByText("short-lived")).not.toBeInTheDocument()
    );
  });

  it("does NOT close when mousedown fires inside the sheet (false branch of !contains)", async () => {
    render(<VocabularyPage />);
    await act(async () => await flushPromises());
    await screen.findByText("ephemeral");

    await userEvent.click(screen.getByRole("button", { name: /ephemeral/i }));
    await waitFor(() => expect(screen.getByText("short-lived")).toBeInTheDocument());

    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 110));
    });

    // Fire mousedown INSIDE the sheet (the definition text itself)
    const insideEl = screen.getByText("short-lived");
    fireEvent.mouseDown(insideEl);

    // Sheet should still be visible
    expect(screen.getByText("short-lived")).toBeInTheDocument();
  });
});

// ── Line 46: getWordDefinition catch callback ────────────────────────────────

describe("VocabularyPage — DefinitionSheet getWordDefinition error (line 46)", () => {
  it("silently catches getWordDefinition rejection and stops loading", async () => {
    mockGetWordDefinition.mockRejectedValue(new Error("Network error"));

    render(<VocabularyPage />);
    await act(async () => await flushPromises());
    await screen.findByText("ephemeral");

    await userEvent.click(screen.getByRole("button", { name: /ephemeral/i }));

    // After rejection, loading stops and "No definition found" shows
    await waitFor(() =>
      expect(screen.getByText(/No definition found/i)).toBeInTheDocument()
    );
  });

  it("opens DefinitionSheet with lang=null (lang ?? undefined becomes undefined)", async () => {
    mockGetVocabulary.mockResolvedValue([
      {
        id: 1,
        word: "test",
        lemma: "test",
        language: null,
        occurrences: [{ book_id: 1, book_title: "B", chapter_index: 0, sentence_text: "test" }],
      },
    ]);
    mockGetWordDefinition.mockResolvedValue({
      lemma: "test",
      language: "en",
      definitions: [{ pos: "noun", text: "a trial" }],
      url: "",
    });

    render(<VocabularyPage />);
    await act(async () => await flushPromises());
    await screen.findByText("test");

    await userEvent.click(screen.getByRole("button", { name: /^test$/i }));
    await waitFor(() => expect(screen.getByText("a trial")).toBeInTheDocument());

    // getWordDefinition called with undefined for lang (null ?? undefined = undefined)
    expect(mockGetWordDefinition).toHaveBeenCalledWith("test", undefined);
  });
});

// ── Line 51: non-Escape keydown does NOT close the sheet ────────────────────

describe("VocabularyPage — DefinitionSheet non-Escape keydown (line 51)", () => {
  it("does not close when a non-Escape key is pressed", async () => {
    render(<VocabularyPage />);
    await act(async () => await flushPromises());
    await screen.findByText("ephemeral");

    await userEvent.click(screen.getByRole("button", { name: /ephemeral/i }));
    await waitFor(() => expect(screen.getByText("short-lived")).toBeInTheDocument());

    // Press a non-Escape key → sheet stays open
    fireEvent.keyDown(document, { key: "Enter" });

    expect(screen.getByText("short-lived")).toBeInTheDocument();
  });
});

// ── Line 162: letterGroups "#" fallback when lemma[0] is undefined ────────────

describe("VocabularyPage — '#' letter group fallback (line 162)", () => {
  it("groups word under '#' when lemma is empty string", async () => {
    mockGetVocabulary.mockResolvedValue([
      {
        id: 1,
        word: "",
        lemma: null,
        language: null,
        occurrences: [{ book_id: 1, book_title: "B", chapter_index: 0, sentence_text: "s" }],
      },
    ]);

    render(<VocabularyPage />);
    await act(async () => await flushPromises());

    // Word grouped under "#" since lemma[0] is undefined
    await waitFor(() => expect(screen.getByText("#")).toBeInTheDocument());
  });
});

// ── Line 174: scrollIntoView after 200ms when targetWord is set ───────────────

describe("VocabularyPage — target word scrollIntoView (line 174)", () => {
  it("calls scrollIntoView after 200ms when targetWord matches a word", async () => {
    mockGetParam.mockImplementation((k: string) =>
      k === "word" ? "ephemeral" : null
    );

    render(<VocabularyPage />);
    await act(async () => await flushPromises());
    await screen.findByText("ephemeral");

    // Wait 250ms for the setTimeout(200) to fire
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 250));
    });

    // scrollIntoView is mocked globally in jest.setup.js
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });
});

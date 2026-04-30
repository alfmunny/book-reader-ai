/**
 * Regression test for #2477: DefinitionSheet must show a Wiktionary fallback
 * link when no definitions are found, so the user has a next step instead of
 * a dead-end "No definition found." message.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "token123" } }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
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

const SAMPLE_WORDS = [
  {
    id: 1,
    word: "ephemeral",
    lemma: "ephemeral",
    language: "en",
    occurrences: [{ book_id: 1, book_title: "Moby Dick", chapter_index: 0, sentence_text: "The ephemeral whale." }],
  },
];

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetVocabulary.mockResolvedValue(SAMPLE_WORDS);
});

describe("DefinitionSheet — no-definition fallback link (closes #2477)", () => {
  it("shows a Wiktionary link when the API returns empty definitions array", async () => {
    mockGetWordDefinition.mockResolvedValue({
      lemma: "ephemeral",
      language: "en",
      definitions: [],
      url: "https://en.wiktionary.org/wiki/ephemeral",
    });

    render(<VocabularyPage />);
    await flushPromises();
    await screen.findByText("ephemeral");

    await userEvent.click(screen.getByRole("button", { name: "ephemeral" }));

    await waitFor(() => expect(screen.getByText(/No definition found/i)).toBeInTheDocument());

    // Must render a fallback Wiktionary link — not a dead end
    const link = screen.getByRole("link", { name: /Search Wiktionary/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", expect.stringContaining("wiktionary.org/wiki/ephemeral"));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("constructs a Wiktionary URL from word when def is null", async () => {
    // Simulate API resolving with null (backend returned nothing)
    mockGetWordDefinition.mockResolvedValue(null as any);

    render(<VocabularyPage />);
    await flushPromises();
    await screen.findByText("ephemeral");

    await userEvent.click(screen.getByRole("button", { name: "ephemeral" }));

    await waitFor(() => expect(screen.getByText(/No definition found/i)).toBeInTheDocument());

    const link = screen.getByRole("link", { name: /Search Wiktionary/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", expect.stringContaining("wiktionary.org/wiki/ephemeral"));
  });
});

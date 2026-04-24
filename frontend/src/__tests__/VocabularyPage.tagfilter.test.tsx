/**
 * Tests for vocabulary page tag filter pill bar (slice 2 of #741).
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

const listVocabularyTags = jest.fn();
const getVocabularyWordTags = jest.fn();

jest.mock("@/lib/api", () => ({
  getVocabulary: jest.fn(),
  deleteVocabularyWord: jest.fn(),
  exportVocabularyToObsidian: jest.fn(),
  getWordDefinition: jest.fn(),
  listVocabularyTags: (...args: unknown[]) => listVocabularyTags(...args),
  getVocabularyWordTags: (...args: unknown[]) => getVocabularyWordTags(...args),
  addVocabularyWordTag: jest.fn().mockResolvedValue({ tag: "" }),
  removeVocabularyWordTag: jest.fn().mockResolvedValue(undefined),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

import * as api from "@/lib/api";
import VocabularyPage from "@/app/vocabulary/page";

const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;

const WORDS = [
  {
    id: 10,
    word: "ephemeral",
    occurrences: [
      {
        book_id: 1,
        book_title: "Moby Dick",
        chapter_index: 2,
        sentence_text: "The ephemeral whale loomed.",
      },
    ],
  },
  {
    id: 20,
    word: "ardent",
    occurrences: [
      {
        book_id: 1,
        book_title: "Moby Dick",
        chapter_index: 5,
        sentence_text: "His ardent gaze swept the sea.",
      },
    ],
  },
];

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetVocabulary.mockResolvedValue(WORDS);
  listVocabularyTags.mockResolvedValue([]);
  getVocabularyWordTags.mockResolvedValue([]);
});

test("pill bar does not render when the user has no tags", async () => {
  listVocabularyTags.mockResolvedValue([]);
  render(<VocabularyPage />);
  await screen.findByText("ephemeral");
  await flushPromises();
  expect(screen.queryByTestId("tag-filter-bar")).not.toBeInTheDocument();
});

test("pill bar renders one pill per tag plus an 'All' pill, with word counts", async () => {
  listVocabularyTags.mockResolvedValue([
    { tag: "verbs", word_count: 3 },
    { tag: "nouns", word_count: 1 },
  ]);
  render(<VocabularyPage />);
  await screen.findByText("ephemeral");
  await flushPromises();

  const bar = await screen.findByTestId("tag-filter-bar");
  expect(bar).toBeInTheDocument();
  expect(screen.getByTestId("tag-filter-all")).toHaveAttribute("aria-pressed", "true");

  const verbsPill = screen.getByTestId("tag-filter-verbs");
  expect(verbsPill).toHaveAttribute("aria-pressed", "false");
  expect(verbsPill).toHaveTextContent("verbs");
  expect(verbsPill).toHaveTextContent("3");

  const nounsPill = screen.getByTestId("tag-filter-nouns");
  expect(nounsPill).toHaveTextContent("nouns");
  expect(nounsPill).toHaveTextContent("1");
});

test("clicking a pill filters the word list to words carrying that tag", async () => {
  listVocabularyTags.mockResolvedValue([{ tag: "verbs", word_count: 1 }]);
  getVocabularyWordTags.mockImplementation((id: number) =>
    Promise.resolve(id === 10 ? ["verbs"] : []),
  );

  render(<VocabularyPage />);
  await screen.findByText("ephemeral");
  await screen.findByTestId("tag-filter-verbs");

  const user = userEvent.setup();
  await user.click(screen.getByTestId("tag-filter-verbs"));

  await waitFor(() => {
    expect(screen.getByTestId("tag-filter-verbs")).toHaveAttribute("aria-pressed", "true");
  });
  expect(screen.getByTestId("tag-filter-all")).toHaveAttribute("aria-pressed", "false");

  await waitFor(() => {
    expect(screen.queryByText("ardent")).not.toBeInTheDocument();
  });
  expect(screen.getByText("ephemeral")).toBeInTheDocument();
});

test("clicking 'All' clears an active tag filter", async () => {
  listVocabularyTags.mockResolvedValue([{ tag: "verbs", word_count: 1 }]);
  getVocabularyWordTags.mockImplementation((id: number) =>
    Promise.resolve(id === 10 ? ["verbs"] : []),
  );

  render(<VocabularyPage />);
  await screen.findByText("ephemeral");
  await screen.findByTestId("tag-filter-verbs");

  const user = userEvent.setup();
  await user.click(screen.getByTestId("tag-filter-verbs"));
  await waitFor(() => {
    expect(screen.queryByText("ardent")).not.toBeInTheDocument();
  });

  await user.click(screen.getByTestId("tag-filter-all"));
  await waitFor(() => {
    expect(screen.getByText("ardent")).toBeInTheDocument();
  });
  expect(screen.getByText("ephemeral")).toBeInTheDocument();
  expect(screen.getByTestId("tag-filter-all")).toHaveAttribute("aria-pressed", "true");
});

test("clicking the active pill again toggles the filter off", async () => {
  listVocabularyTags.mockResolvedValue([{ tag: "verbs", word_count: 1 }]);
  getVocabularyWordTags.mockImplementation((id: number) =>
    Promise.resolve(id === 10 ? ["verbs"] : []),
  );

  render(<VocabularyPage />);
  await screen.findByText("ephemeral");
  await screen.findByTestId("tag-filter-verbs");

  const user = userEvent.setup();
  await user.click(screen.getByTestId("tag-filter-verbs"));
  await waitFor(() => {
    expect(screen.queryByText("ardent")).not.toBeInTheDocument();
  });
  await user.click(screen.getByTestId("tag-filter-verbs"));
  await waitFor(() => {
    expect(screen.getByText("ardent")).toBeInTheDocument();
  });
  expect(screen.getByTestId("tag-filter-verbs")).toHaveAttribute("aria-pressed", "false");
});

test("shows a tag-specific empty state message when filter matches nothing", async () => {
  listVocabularyTags.mockResolvedValue([{ tag: "orphan", word_count: 0 }]);
  getVocabularyWordTags.mockResolvedValue([]);

  render(<VocabularyPage />);
  await screen.findByText("ephemeral");
  await screen.findByTestId("tag-filter-orphan");

  const user = userEvent.setup();
  await user.click(screen.getByTestId("tag-filter-orphan"));

  expect(await screen.findByText(/no words tagged with/i)).toBeInTheDocument();
});

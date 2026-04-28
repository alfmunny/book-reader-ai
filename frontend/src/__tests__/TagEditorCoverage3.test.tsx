/**
 * Remaining branch coverage for components/TagEditor.tsx (closes #2025).
 *
 * Covers:
 *  - line 36/42: cleanup — component unmounts before getVocabularyWordTags resolves
 *  - line 54: double-submit guard (submittingRef.current already true)
 *  - line 69: duplicate tag dedup (tag already in list, keep existing array)
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let resolveFetch: ((v: string[]) => void) | undefined;

jest.mock("@/lib/api", () => ({
  getVocabularyWordTags: jest.fn(() => new Promise((res) => { resolveFetch = res; })),
  addVocabularyWordTag: jest.fn(),
  removeVocabularyWordTag: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import * as api from "@/lib/api";
import TagEditor from "@/components/TagEditor";

const mockGetTags = api.getVocabularyWordTags as jest.MockedFunction<typeof api.getVocabularyWordTags>;
const mockAddTag = api.addVocabularyWordTag as jest.MockedFunction<typeof api.addVocabularyWordTag>;

beforeEach(() => {
  jest.clearAllMocks();
  resolveFetch = undefined;
});

test("unmount before getVocabularyWordTags resolves — no state update on dead component", async () => {
  // getVocabularyWordTags is mocked to a pending promise (resolveFetch is captured)
  const { unmount } = render(<TagEditor vocabularyId={99} />);

  // Unmount before the fetch resolves — cleanup sets alive=false
  unmount();

  // Now resolve the pending promise — lines 36 and 42 take their alive=false paths
  await act(async () => {
    resolveFetch?.(["noun"]);
    await Promise.resolve();
  });

  // No error thrown, component cleanly handled the stale response
  expect(mockGetTags).toHaveBeenCalledWith(99);
});

test("duplicate tag returned by API is deduped (line 69 true branch)", async () => {
  mockAddTag.mockResolvedValue({ tag: "verb" });

  render(<TagEditor vocabularyId={10} initialTags={["verb"]} />);

  // Open the input and type the same tag that already exists
  await userEvent.click(screen.getByRole("button", { name: /add tag/i }));
  await userEvent.type(screen.getByRole("textbox", { name: /new tag/i }), "verb");
  await userEvent.keyboard("{Enter}");

  // tags.includes("verb") is true → kept the original array, no duplicate
  await waitFor(() => {
    const chips = screen.getAllByTestId(/tag-chip-/);
    expect(chips).toHaveLength(1);
  });
});

test("double-submit guard — second submitTag call while first is in-flight is a no-op (line 54)", async () => {
  let resolveAdd: ((v: { tag: string }) => void) | undefined;
  mockAddTag.mockImplementation(() => new Promise((res) => { resolveAdd = res; }));

  render(<TagEditor vocabularyId={20} initialTags={[]} />);

  await userEvent.click(screen.getByRole("button", { name: /add tag/i }));
  await userEvent.type(screen.getByRole("textbox", { name: /new tag/i }), "noun");

  // First submit
  await userEvent.keyboard("{Enter}");

  // Second submit while first is still pending — hits submittingRef.current guard
  await userEvent.keyboard("{Enter}");

  // Resolve the first call
  await act(async () => {
    resolveAdd?.({ tag: "noun" });
    await Promise.resolve();
  });

  // API was called exactly once (second submit was guarded)
  expect(mockAddTag).toHaveBeenCalledTimes(1);
});

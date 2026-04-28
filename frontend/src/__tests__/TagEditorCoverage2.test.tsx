/**
 * Coverage tests for components/TagEditor.tsx — functions not covered by existing tests.
 * Closes #1991 — targets:
 *   lines 36-42: getVocabularyWordTags .catch(() => {}) when no initialTags provided
 *   lines 57-59: submitTag with empty/whitespace draft
 *   lines 62-63: submitTag with tag > 50 chars
 *   line 78:     addVocabularyWordTag throws a non-ApiError
 *   line 94:     removeVocabularyWordTag throws
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/lib/api", () => ({
  listVocabularyTags: jest.fn().mockResolvedValue([]),
  getVocabularyWordTags: jest.fn().mockResolvedValue([]),
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
const mockRemoveTag = api.removeVocabularyWordTag as jest.MockedFunction<typeof api.removeVocabularyWordTag>;

beforeEach(() => jest.clearAllMocks());

// ── getVocabularyWordTags .catch when no initialTags (lines 36-42) ───────────

test("getVocabularyWordTags rejection is silently swallowed when no initialTags", async () => {
  mockGetTags.mockRejectedValue(new Error("Network failure"));

  render(<TagEditor vocabularyId={10} />);

  // The component should settle to the loaded state without throwing
  await waitFor(() => {
    expect(screen.getByTestId("add-tag-10")).toBeInTheDocument();
  });
});

// ── submitTag with empty draft (lines 57-59) ──────────────────────────────────

test("submitting whitespace-only draft closes the input without calling addVocabularyWordTag", async () => {
  render(<TagEditor vocabularyId={1} initialTags={[]} />);

  await userEvent.click(screen.getByRole("button", { name: /add tag/i }));
  // Leave input empty and blur to trigger submitTag
  const input = screen.getByRole("textbox", { name: /new tag/i });
  await userEvent.click(input);
  await userEvent.tab(); // blur → submitTag("") → early return

  expect(mockAddTag).not.toHaveBeenCalled();
  // Adding input is gone after the early return
  expect(screen.queryByRole("textbox", { name: /new tag/i })).not.toBeInTheDocument();
});

// ── submitTag with tag > 50 chars (lines 62-63) ───────────────────────────────

test("submitting a tag longer than 50 chars shows length error without calling API", async () => {
  render(<TagEditor vocabularyId={2} initialTags={[]} />);

  await userEvent.click(screen.getByRole("button", { name: /add tag/i }));
  const input = screen.getByRole("textbox", { name: /new tag/i });
  // fireEvent bypasses the maxLength=50 HTML attribute so raw.length > 50 is reachable
  fireEvent.change(input, { target: { value: "a".repeat(51) } });
  await userEvent.keyboard("{Enter}");

  await waitFor(() =>
    expect(screen.getByText(/tag is too long/i)).toBeInTheDocument(),
  );
  expect(mockAddTag).not.toHaveBeenCalled();
});

// ── submitTag — non-ApiError catch (line 78) ──────────────────────────────────

test("non-ApiError from addVocabularyWordTag shows generic error message", async () => {
  mockAddTag.mockRejectedValue(new TypeError("Network failure"));

  render(<TagEditor vocabularyId={3} initialTags={[]} />);

  await userEvent.click(screen.getByRole("button", { name: /add tag/i }));
  const input = screen.getByRole("textbox", { name: /new tag/i });
  await userEvent.type(input, "noun");
  await userEvent.keyboard("{Enter}");

  await waitFor(() =>
    expect(screen.getByText(/failed to add tag/i)).toBeInTheDocument(),
  );
});

// ── handleRemove error (line 94) ──────────────────────────────────────────────

test("removeVocabularyWordTag failure shows generic remove error message", async () => {
  mockRemoveTag.mockRejectedValue(new Error("Server error"));

  render(<TagEditor vocabularyId={4} initialTags={["verb"]} />);

  await userEvent.click(screen.getByRole("button", { name: /remove tag verb/i }));

  await waitFor(() =>
    expect(screen.getByText(/failed to remove tag/i)).toBeInTheDocument(),
  );
});

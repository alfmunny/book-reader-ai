/**
 * RTL tests for TagEditor load-failure error state (issue #2426).
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGetVocabularyWordTags = jest.fn();
jest.mock("@/lib/api", () => ({
  getVocabularyWordTags: (...args: any[]) => mockGetVocabularyWordTags(...args),
  addVocabularyWordTag: jest.fn(),
  removeVocabularyWordTag: jest.fn(),
}));

import TagEditor from "@/components/TagEditor";

const BASE = { vocabularyId: 42, selectedTag: null };

beforeEach(() => jest.clearAllMocks());

describe("TagEditor — load failure error state (issue #2426)", () => {
  it("shows retry button when initial tag fetch rejects", async () => {
    mockGetVocabularyWordTags.mockRejectedValue(new Error("network error"));
    render(<TagEditor {...BASE} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    );
  });

  it("does NOT show '+ tag' button when fetch failed (error state is shown instead)", async () => {
    mockGetVocabularyWordTags.mockRejectedValue(new Error("network error"));
    render(<TagEditor {...BASE} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: /add tag/i })).not.toBeInTheDocument();
  });

  it("retries the fetch and shows tags on success after clicking Retry", async () => {
    mockGetVocabularyWordTags
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(["fiction", "german"]);
    render(<TagEditor {...BASE} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() =>
      expect(screen.getByText("fiction")).toBeInTheDocument()
    );
    expect(screen.getByText("german")).toBeInTheDocument();
  });

  it("shows tags normally when fetch succeeds", async () => {
    mockGetVocabularyWordTags.mockResolvedValue(["novel", "classic"]);
    render(<TagEditor {...BASE} />);
    await waitFor(() => expect(screen.getByText("novel")).toBeInTheDocument());
    expect(screen.getByText("classic")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});

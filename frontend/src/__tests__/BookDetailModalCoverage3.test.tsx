/**
 * Coverage tests for components/BookDetailModal.tsx — functions not covered by existing tests.
 * Closes #1989 — targets: .catch(() => {}) on getBookTranslationStatus rejection (line 30).
 */
import React from "react";
import { render, waitFor } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  getBookTranslationStatus: jest.fn(),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn(() => ({ translationLang: "de" })),
}));

import * as api from "@/lib/api";
import BookDetailModal from "@/components/BookDetailModal";
import type { BookMeta } from "@/lib/api";

const mockGetTranslationStatus = api.getBookTranslationStatus as jest.MockedFunction<
  typeof api.getBookTranslationStatus
>;

const BOOK: BookMeta = {
  id: 99,
  title: "The Stranger",
  authors: ["Albert Camus"],
  languages: ["fr"],
  subjects: [],
  download_count: 1000,
  cover: "",
};

test("getBookTranslationStatus rejection is silently swallowed — no throw", async () => {
  mockGetTranslationStatus.mockRejectedValue(new Error("Network error"));

  render(
    <BookDetailModal book={BOOK} onClose={jest.fn()} onRead={jest.fn()} />,
  );

  await waitFor(() => expect(mockGetTranslationStatus).toHaveBeenCalled());
  // If the .catch(() => {}) is missing, this would throw an unhandled rejection.
  // The test passing confirms the catch is in place.
});

/**
 * BookDetailModal — additional branch coverage:
 *  Line 106: LANG_NAMES[translationLang] ?? translationLang — fires when lang not in map
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  getBookTranslationStatus: jest.fn(),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn(() => ({ translationLang: "ar" })), // "ar" not in LANG_NAMES map
}));

import * as api from "@/lib/api";
import BookDetailModal from "@/components/BookDetailModal";
import type { BookMeta } from "@/lib/api";

const mockGetTranslationStatus = api.getBookTranslationStatus as jest.MockedFunction<
  typeof api.getBookTranslationStatus
>;

const BASE_BOOK: BookMeta = {
  id: 1,
  title: "Moby Dick",
  authors: ["Herman Melville"],
  languages: ["en"],
  subjects: [],
  download_count: 5000,
  cover: "",
};

// ── Line 106: LANG_NAMES[translationLang] ?? translationLang fallback ─────────

describe("BookDetailModal — unknown translationLang ?? fallback (line 106)", () => {
  it("uses raw translationLang when it is not in LANG_NAMES (covers ?? false branch)", async () => {
    // translationLang="ar" is not in LANG_NAMES → LANG_NAMES["ar"] = undefined → ?? "ar"
    mockGetTranslationStatus.mockResolvedValue({
      translated_chapters: 3,
      total_chapters: 10,
    });

    render(
      <BookDetailModal
        book={BASE_BOOK}
        onClose={jest.fn()}
        onRead={jest.fn()}
      />
    );

    // showTranslation = hasTranslation (true) && "ar" !== "en" (true) → shows translation badge
    // The badge text contains "ar" (the raw lang code) since it's not in LANG_NAMES
    await waitFor(() =>
      expect(screen.getByText(/ar/)).toBeInTheDocument(),
    );
  });
});

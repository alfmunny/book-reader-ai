/**
 * Regression tests for issue #621 — notes page header buttons below 44px touch target.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "tok" }, status: "authenticated" }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ bookId: "10" }),
}));

jest.mock("@/lib/api", () => ({
  getBookChapters: jest.fn().mockResolvedValue({
    book_id: 10,
    meta: { id: 10, title: "Moby Dick", authors: [], languages: [], subjects: [], download_count: 0, cover: null },
    chapters: [{ title: "Chapter 1", text: "" }],
  }),
  getAnnotations: jest.fn().mockResolvedValue([
    { id: 1, book_id: 10, chapter_index: 0, sentence_text: "Hello", note_text: "Note", color: "yellow" },
  ]),
  getInsights: jest.fn().mockResolvedValue([]),
  getVocabulary: jest.fn().mockResolvedValue([]),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
  deleteInsight: jest.fn(),
  exportVocabularyToObsidian: jest.fn(),
}));

import BookNotesPage from "@/app/notes/[bookId]/page";

afterEach(() => jest.clearAllMocks());

test("'Collapse all' button has min-h-[44px]", async () => {
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText("Collapse all"));
  const btn = screen.getByRole("button", { name: "Collapse all" });
  expect(btn.className).toContain("min-h-[44px]");
});

test("'By section' view toggle button has min-h-[44px]", async () => {
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText("By section"));
  const btn = screen.getByRole("button", { name: "By section" });
  expect(btn.className).toContain("min-h-[44px]");
});

test("'By chapter' view toggle button has min-h-[44px]", async () => {
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText("By chapter"));
  const btn = screen.getByRole("button", { name: "By chapter" });
  expect(btn.className).toContain("min-h-[44px]");
});

test("Export button has min-h-[44px]", async () => {
  render(<BookNotesPage />);
  await waitFor(() => screen.getByText(/Export/));
  // The export button has an arrow arrow character followed by Export
  const btn = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.includes("Export") && !b.getAttribute("aria-label")?.includes("edit") && !b.getAttribute("aria-label")?.includes("delete")
  );
  expect(btn).not.toBeUndefined();
  expect(btn!.className).toContain("min-h-[44px]");
});

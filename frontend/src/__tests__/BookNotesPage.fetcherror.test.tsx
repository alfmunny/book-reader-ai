/**
 * Regression #844: BookNotesPage (notes/[bookId]) must show an error state
 * when the Promise.all() fetch rejects, not the "No notes yet" empty state.
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
import BookNotesPage from "@/app/notes/[bookId]/page";

const mockGetBookChapters = api.getBookChapters as jest.MockedFunction<typeof api.getBookChapters>;
const mockGetAnnotations = api.getAnnotations as jest.MockedFunction<typeof api.getAnnotations>;
const mockGetInsights = api.getInsights as jest.MockedFunction<typeof api.getInsights>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("BookNotesPage — fetch error state (regression #844)", () => {
  it("shows error message when fetch rejects, not the empty-notes state", async () => {
    mockGetBookChapters.mockRejectedValue(new Error("Network error"));
    mockGetAnnotations.mockResolvedValue([]);
    mockGetInsights.mockResolvedValue([]);
    mockGetVocabulary.mockResolvedValue([]);

    render(<BookNotesPage />);

    await waitFor(() =>
      expect(screen.getByText("Failed to load notes.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("No notes yet")).not.toBeInTheDocument();
  });
});

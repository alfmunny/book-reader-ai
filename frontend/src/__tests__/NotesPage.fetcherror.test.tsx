/**
 * Regression #844: NotesOverviewPage must show an error state when
 * the Promise.all() fetch rejects, not the empty "No notes yet" state.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "token" }, status: "authenticated" }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  getAllAnnotations: jest.fn(),
  getAllInsights: jest.fn(),
  getVocabulary: jest.fn(),
}));

import * as api from "@/lib/api";
import NotesPage from "@/app/notes/page";

const mockGetAllAnnotations = api.getAllAnnotations as jest.MockedFunction<typeof api.getAllAnnotations>;
const mockGetAllInsights = api.getAllInsights as jest.MockedFunction<typeof api.getAllInsights>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("NotesOverviewPage — fetch error state (regression #844)", () => {
  it("shows error message when Promise.all rejects, not the empty-notes state", async () => {
    mockGetAllAnnotations.mockRejectedValue(new Error("Network error"));
    mockGetAllInsights.mockResolvedValue([]);
    mockGetVocabulary.mockResolvedValue([]);

    render(<NotesPage />);

    await waitFor(() =>
      expect(screen.getByText("Failed to load notes.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("No notes yet")).not.toBeInTheDocument();
  });
});

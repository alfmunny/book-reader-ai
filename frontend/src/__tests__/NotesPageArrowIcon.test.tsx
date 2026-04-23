/**
 * Regression test for #577: notes page book-list arrow must use SVG ArrowRightIcon,
 * not the raw → character (which leaks into the button's accessible name).
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "@testing-library/react";

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

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllInsights.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
});

describe("NotesPage — book list arrow icon (#577)", () => {
  it("does not render the raw → character in book list buttons", async () => {
    mockGetAllAnnotations.mockResolvedValue([
      {
        id: 1, book_id: 10, chapter_index: 0,
        sentence_text: "A sentence.", note_text: "", color: "yellow",
        book_title: "Pride and Prejudice", created_at: "2026-01-01T00:00:00",
      },
    ]);

    render(<NotesPage />);
    await act(async () => await flushPromises());

    await waitFor(() =>
      expect(screen.getByText("Pride and Prejudice")).toBeInTheDocument()
    );

    const btn = screen.getByText("Pride and Prejudice").closest("button");
    expect(btn).not.toBeNull();
    // Raw → character must not appear in button text content
    expect(btn!.textContent).not.toContain("→");
  });

  it("renders an SVG icon in the book list button instead of → text", async () => {
    mockGetAllAnnotations.mockResolvedValue([
      {
        id: 1, book_id: 10, chapter_index: 0,
        sentence_text: "A sentence.", note_text: "", color: "yellow",
        book_title: "Moby Dick", created_at: "2026-01-01T00:00:00",
      },
    ]);

    render(<NotesPage />);
    await act(async () => await flushPromises());

    await waitFor(() =>
      expect(screen.getByText("Moby Dick")).toBeInTheDocument()
    );

    const btn = screen.getByText("Moby Dick").closest("button");
    expect(btn).not.toBeNull();
    // An SVG should be present inside the button (from ArrowRightIcon)
    const svg = btn!.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});

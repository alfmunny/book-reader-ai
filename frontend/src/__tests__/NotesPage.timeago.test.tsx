/**
 * NotesPage overview — timeAgo branch coverage (lines 19-23 of app/notes/page.tsx).
 * Covers: "just now", "Xm ago", "Xh ago", "Xd ago".
 */
import React from "react";
import { render, waitFor, screen } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { backendToken: "tok" }, status: "authenticated" }),
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
import type { AnnotationWithBook } from "@/lib/api";

const mockGetAllAnnotations = api.getAllAnnotations as jest.MockedFunction<typeof api.getAllAnnotations>;
const mockGetAllInsights = api.getAllInsights as jest.MockedFunction<typeof api.getAllInsights>;
const mockGetVocabulary = api.getVocabulary as jest.MockedFunction<typeof api.getVocabulary>;

function makeAnn(created_at: string): AnnotationWithBook {
  return {
    id: 1, book_id: 1, chapter_index: 0,
    sentence_text: "s", note_text: "", color: "yellow",
    book_title: "Test Book", created_at,
  } as AnnotationWithBook;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllInsights.mockResolvedValue([]);
  mockGetVocabulary.mockResolvedValue([]);
});

test("timeAgo shows 'just now' for activity < 1 minute ago", async () => {
  const recent = new Date(Date.now() - 30_000).toISOString(); // 30s ago
  mockGetAllAnnotations.mockResolvedValue([makeAnn(recent)]);

  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText("just now")).toBeInTheDocument());
});

test("timeAgo shows 'Xm ago' for activity 1–59 minutes ago", async () => {
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60_000).toISOString();
  mockGetAllAnnotations.mockResolvedValue([makeAnn(thirtyMinsAgo)]);

  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText("30m ago")).toBeInTheDocument());
});

test("timeAgo shows 'Xh ago' for activity 1–23 hours ago", async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
  mockGetAllAnnotations.mockResolvedValue([makeAnn(twoHoursAgo)]);

  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText("2h ago")).toBeInTheDocument());
});

test("timeAgo shows 'Xd ago' for activity 24+ hours ago", async () => {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();
  mockGetAllAnnotations.mockResolvedValue([makeAnn(threeDaysAgo)]);

  render(<NotesPage />);
  await waitFor(() => expect(screen.getByText("3d ago")).toBeInTheDocument());
});

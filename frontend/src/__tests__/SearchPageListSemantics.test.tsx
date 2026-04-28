/**
 * Regression test for #2045: search results sections must use list semantics
 * so screen readers can announce item counts and navigation position.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

const mockSearchParams = { get: (k: string) => (k === "q" ? "Pride" : null) };

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: jest.fn() }),
}));

const mockSearchFn = jest.fn();
jest.mock("@/lib/api", () => ({
  searchInAppContent: (...args: unknown[]) => mockSearchFn(...args),
}));

jest.mock("next/link", () => {
  const Link = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  );
  Link.displayName = "Link";
  return { __esModule: true, default: Link };
});

import SearchPage from "@/app/search/page";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

function makeAnnotation(id: number) {
  return {
    type: "annotation" as const,
    book_id: id,
    book_title: `Book ${id}`,
    chapter_index: 0,
    chapter_title: `Chapter ${id}`,
    snippet: "Some text",
    note_text: "A note",
  };
}

beforeEach(() => {
  mockSearchFn.mockReset();
});

test("search result section renders as a list element", async () => {
  mockSearchFn.mockResolvedValue({
    query: "Pride",
    total: 3,
    results: [makeAnnotation(1), makeAnnotation(2), makeAnnotation(3)],
  });

  render(<SearchPage />);
  await flushPromises();

  await waitFor(() => {
    const list = screen.getByRole("list", { name: /annotations/i });
    expect(list).toBeInTheDocument();
  });

  const items = screen.getAllByRole("listitem");
  expect(items.length).toBeGreaterThanOrEqual(3);
});

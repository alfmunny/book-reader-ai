/**
 * Branch coverage for app/search/page.tsx (closes #2023).
 *
 * Covers:
 *  - book_title / chapter_title fallbacks (lines 32, 56, 71)
 *  - annotation without note_text (line 36 false branch)
 *  - singular result live-region text (line 141)
 *  - error with no message property (line 129)
 *  - non-empty q search effect path (line 116 false branch)
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

const mockSearchParams = { get: (_k: string) => null as string | null };

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

beforeEach(() => {
  mockSearchFn.mockReset();
  mockSearchParams.get = (_k: string) => null;
});

test("annotation without book_title falls back to Book #N label", async () => {
  mockSearchParams.get = (k: string) => (k === "q" ? "hamlet" : null);
  mockSearchFn.mockResolvedValue({
    query: "hamlet",
    total: 1,
    results: [
      {
        type: "annotation",
        book_id: 42,
        book_title: "",
        chapter_index: 2,
        snippet: "some snippet",
        note_text: null,
      },
    ],
  });
  render(<SearchPage />);
  await flushPromises();
  expect(await screen.findByText("Book #42")).toBeInTheDocument();
});

test("annotation with null note_text renders no note div", async () => {
  mockSearchParams.get = (k: string) => (k === "q" ? "hamlet" : null);
  mockSearchFn.mockResolvedValue({
    query: "hamlet",
    total: 1,
    results: [
      {
        type: "annotation",
        book_id: 1,
        book_title: "Hamlet",
        chapter_index: 0,
        snippet: "text",
        note_text: null,
      },
    ],
  });
  render(<SearchPage />);
  await flushPromises();
  await screen.findByText("Hamlet");
  expect(screen.queryByText(/italic/)).not.toBeInTheDocument();
});

test("vocabulary card without book_title falls back to Book #N label", async () => {
  mockSearchParams.get = (k: string) => (k === "q" ? "prince" : null);
  mockSearchFn.mockResolvedValue({
    query: "prince",
    total: 1,
    results: [
      {
        type: "vocabulary",
        book_id: 7,
        book_title: "",
        chapter_index: 0,
        word: "Hamlet",
        snippet: "text",
      },
    ],
  });
  render(<SearchPage />);
  await flushPromises();
  expect(await screen.findByText(/Book #7/)).toBeInTheDocument();
});

test("chapter card without book_title and chapter_title falls back to both fallbacks", async () => {
  mockSearchParams.get = (k: string) => (k === "q" ? "ghost" : null);
  mockSearchFn.mockResolvedValue({
    query: "ghost",
    total: 1,
    results: [
      {
        type: "chapter",
        book_id: 9,
        book_title: "",
        chapter_index: 3,
        chapter_title: "",
        snippet: "text",
      },
    ],
  });
  render(<SearchPage />);
  await flushPromises();
  expect(await screen.findByText(/Book #9/)).toBeInTheDocument();
  expect(screen.getByText(/Chapter 4/)).toBeInTheDocument();
});

test("singular result produces 'result' (no plural s) in live region", async () => {
  mockSearchParams.get = (k: string) => (k === "q" ? "ghost" : null);
  mockSearchFn.mockResolvedValue({
    query: "ghost",
    total: 1,
    results: [
      {
        type: "chapter",
        book_id: 1,
        book_title: "Hamlet",
        chapter_index: 0,
        chapter_title: "Act I",
        snippet: "text",
      },
    ],
  });
  render(<SearchPage />);
  await flushPromises();
  await waitFor(() => {
    const status = document.querySelector("[role=status][aria-live=polite]");
    expect(status?.textContent).toMatch(/Found 1 result for/);
    expect(status?.textContent).not.toMatch(/results/);
  });
});

test("error with no message property shows generic fallback text", async () => {
  mockSearchParams.get = (k: string) => (k === "q" ? "ghost" : null);
  mockSearchFn.mockRejectedValue({});
  render(<SearchPage />);
  await flushPromises();
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Search failed");
});

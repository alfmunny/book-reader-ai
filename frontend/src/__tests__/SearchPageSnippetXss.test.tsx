/**
 * Regression #1027: SnippetHtml must strip attributes from <b> tags and
 * discard other HTML, so stored XSS payloads in annotation/vocab text
 * cannot execute via the search-results page.
 */
import { render, screen, waitFor } from "@testing-library/react";

const mockSearchParams = { get: (k: string) => (k === "q" ? "click" : null) };

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: jest.fn() }),
}));

const mockSearchFn = jest.fn();
jest.mock("@/lib/api", () => ({
  searchInAppContent: (...args: unknown[]) => mockSearchFn(...args),
}));

// isomorphic-dompurify works in Node/jsdom — no mock needed; we test real behaviour.

import SearchPage from "@/app/search/page";

describe("SnippetHtml XSS sanitization (regression #1027)", () => {
  beforeEach(() => {
    mockSearchFn.mockReset();
  });

  it("strips onmouseover attribute from <b> tag in annotation snippet", async () => {
    const xssSnippet = '<b onmouseover="alert(document.cookie)">click</b> me';
    mockSearchFn.mockResolvedValue({
      query: "click",
      total: 1,
      results: [
        {
          type: "annotation",
          id: 1,
          book_id: 1,
          book_title: "Test Book",
          chapter_index: 0,
          snippet: xssSnippet,
          note_text: null,
        },
      ],
    });

    render(<SearchPage />);
    await waitFor(() => screen.getByText(/test book/i));

    const snippet = document.querySelector("span.text-sm");
    expect(snippet).not.toBeNull();
    // The <b> bold tag should survive (FTS highlight), but no attributes
    const boldEl = snippet!.querySelector("b");
    expect(boldEl).not.toBeNull();
    expect(boldEl!.getAttribute("onmouseover")).toBeNull();
    // The raw XSS string must not appear in innerHTML
    expect(snippet!.innerHTML).not.toContain("onmouseover");
    expect(snippet!.innerHTML).not.toContain("alert");
  });

  it("strips <script> tags from snippet entirely", async () => {
    const xssSnippet = "hello <script>alert(1)</script> world";
    mockSearchFn.mockResolvedValue({
      query: "click",
      total: 1,
      results: [
        {
          type: "vocabulary",
          word: "hello",
          occurrence_id: 1,
          book_id: 1,
          book_title: "Test Book",
          chapter_index: 0,
          snippet: xssSnippet,
        },
      ],
    });

    render(<SearchPage />);
    await waitFor(() => screen.getByText(/test book/i));

    const span = document.querySelector("span.text-sm");
    expect(span).not.toBeNull();
    expect(span!.innerHTML).not.toContain("<script>");
    expect(span!.innerHTML).not.toContain("alert");
  });

  it("preserves plain <b> highlight from FTS5", async () => {
    const goodSnippet = "some text with <b>click</b> highlighted";
    mockSearchFn.mockResolvedValue({
      query: "click",
      total: 1,
      results: [
        {
          type: "annotation",
          id: 2,
          book_id: 2,
          book_title: "Book",
          chapter_index: 0,
          snippet: goodSnippet,
          note_text: null,
        },
      ],
    });

    render(<SearchPage />);
    await waitFor(() => screen.getByText(/book/i));

    const span = document.querySelector("span.text-sm");
    expect(span).not.toBeNull();
    expect(span!.querySelector("b")?.textContent).toBe("click");
  });
});

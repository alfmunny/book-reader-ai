import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import TableOfContents from "@/components/TableOfContents";

const CHAPTERS = [
  { title: "CHAPTER I" },
  { title: "CHAPTER II" },
  { title: "CHAPTER III" },
];

function renderToc(props: Partial<React.ComponentProps<typeof TableOfContents>> = {}) {
  const onSelect = jest.fn();
  const utils = render(
    <TableOfContents
      chapters={CHAPTERS}
      chapterIndex={1}
      onSelect={onSelect}
      {...props}
    />
  );
  return { ...utils, onSelect };
}

describe("TableOfContents", () => {
  it("lists every chapter with its number and title", () => {
    renderToc();
    const nav = screen.getByRole("navigation", { name: /table of contents/i });
    const rows = within(nav).getAllByRole("button");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("1");
    expect(rows[0]).toHaveTextContent("CHAPTER I");
  });

  it("marks the current chapter with aria-current", () => {
    renderToc();
    const current = screen.getByRole("button", { current: true });
    expect(current).toHaveTextContent("CHAPTER II");
  });

  it("calls onSelect with the chapter index when a row is clicked", () => {
    const { onSelect } = renderToc();
    fireEvent.click(screen.getByRole("button", { name: /CHAPTER III/ }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("falls back to a section label when a chapter has no title", () => {
    renderToc({ chapters: [{ title: "" }, { title: "Real" }] });
    expect(screen.getByRole("button", { name: /Section 1/ })).toBeInTheDocument();
  });

  it("exposes the full title so long headings are not lost to truncation", () => {
    const long = "But it is the occasion of this great Apology which invests it";
    renderToc({ chapters: [{ title: long }] });
    expect(screen.getByRole("button", { name: new RegExp(long) })).toHaveAttribute(
      "title",
      long
    );
  });

  // ── Filter ────────────────────────────────────────────────────────────────

  it("hides the filter for short books", () => {
    renderToc();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("shows the filter once a book is long enough to need one", () => {
    renderToc({ chapters: Array.from({ length: 40 }, (_, i) => ({ title: `Ch ${i}` })) });
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("filters by title text", () => {
    const chapters = Array.from({ length: 40 }, (_, i) => ({ title: `Chapter ${i + 1}` }));
    chapters[7] = { title: "Loomings" };
    renderToc({ chapters });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "loom" } });
    const nav = screen.getByRole("navigation", { name: /table of contents/i });
    expect(within(nav).getAllByRole("button")).toHaveLength(1);
    expect(within(nav).getByRole("button")).toHaveTextContent("Loomings");
  });

  it("filters by chapter number", () => {
    const chapters = Array.from({ length: 40 }, (_, i) => ({ title: `Ch ${i + 1}` }));
    renderToc({ chapters });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "12" } });
    const nav = screen.getByRole("navigation", { name: /table of contents/i });
    expect(within(nav).getByRole("button")).toHaveTextContent("Ch 12");
  });

  it("shows an empty state when nothing matches", () => {
    renderToc({ chapters: Array.from({ length: 40 }, (_, i) => ({ title: `Ch ${i}` })) });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzz" } });
    expect(screen.getByText(/no chapter matches/i)).toBeInTheDocument();
  });

  // ── Translation coverage (optional data) ──────────────────────────────────

  it("says nothing about translation when coverage is not supplied", () => {
    renderToc();
    expect(screen.getByRole("button", { name: "1. CHAPTER I" })).toBeInTheDocument();
  });

  it("states translation status in the accessible name, not by colour alone", () => {
    renderToc({ translated: new Set([0]) });
    expect(
      screen.getByRole("button", { name: "1. CHAPTER I. Translated" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "2. CHAPTER II. Not translated" })
    ).toBeInTheDocument();
  });

  // ── Front matter (optional data) ──────────────────────────────────────────

  it("renders no front-matter group when no chapter is marked as front matter", () => {
    renderToc();
    expect(screen.queryByRole("button", { name: /front matter/i })).not.toBeInTheDocument();
  });

  it("collapses front matter behind a group header by default", () => {
    renderToc({ roles: { 0: "frontmatter" } });
    const group = screen.getByRole("button", { name: /front matter/i });
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "1. CHAPTER I" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2. CHAPTER II" })).toBeInTheDocument();
  });

  it("expands front matter when its header is activated", () => {
    renderToc({ roles: { 0: "frontmatter" } });
    fireEvent.click(screen.getByRole("button", { name: /front matter/i }));
    expect(screen.getByRole("button", { name: /front matter/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("button", { name: "1. CHAPTER I" })).toBeInTheDocument();
  });

  it("keeps front matter open when the reader is currently inside it", () => {
    renderToc({ roles: { 0: "frontmatter" }, chapterIndex: 0 });
    expect(screen.getByRole("button", { name: /front matter/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
});

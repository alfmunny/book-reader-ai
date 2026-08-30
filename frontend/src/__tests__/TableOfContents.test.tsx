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

  it("wraps a long title rather than clipping it", () => {
    // #2745 acceptance: "No chapter title is truncated in the panel." A tooltip
    // is a mitigation, not the criterion — the row has to show the whole title.
    const long = "But it is the occasion of this great Apology which invests it";
    renderToc({ chapters: [{ title: long }] });
    const titleEl = screen.getByText(long);
    expect(titleEl.className).not.toContain("truncate");
    expect(titleEl.className).toContain("break-words");
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


  // ── Part grouping (#2745 Phase 2) ─────────────────────────────────────────

  const HAMLET = [
    { title: "SCENE I. A platform before the Castle." },
    { title: "SCENE II. A room of state." },
    { title: "SCENE I. A room in Polonius's house." },
    { title: "EPILOGUE" },
  ];
  const ACTS = { 0: "ACT I", 1: "ACT I", 2: "ACT II" };

  it("renders no group headers when the book declares no parts", () => {
    renderToc();
    const nav = screen.getByRole("navigation", { name: /table of contents/i });
    expect(within(nav).getAllByRole("button")).toHaveLength(3);
  });

  it("gathers consecutive chapters of one act under its header", () => {
    renderToc({ chapters: HAMLET, parts: ACTS });
    expect(screen.getByRole("button", { name: /^act i$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^act ii$/i })).toBeInTheDocument();
  });

  it("shows part groups expanded — they are the reading path, not apparatus", () => {
    renderToc({ chapters: HAMLET, parts: ACTS });
    expect(screen.getByRole("button", { name: /^act i$/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(
      screen.getByRole("button", { name: "1. SCENE I. A platform before the Castle." })
    ).toBeInTheDocument();
  });

  it("collapses a part when its header is activated", () => {
    // From chapter 4, which is in no act — a section holding the current
    // chapter stays open no matter what, which the next test covers.
    renderToc({ chapters: HAMLET, parts: ACTS, chapterIndex: 3 });
    fireEvent.click(screen.getByRole("button", { name: /^act i$/i }));
    expect(screen.getByRole("button", { name: /^act i$/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(
      screen.queryByRole("button", { name: "1. SCENE I. A platform before the Castle." })
    ).not.toBeInTheDocument();
    // Collapsing one act must not touch another.
    expect(
      screen.getByRole("button", { name: "3. SCENE I. A room in Polonius's house." })
    ).toBeInTheDocument();
  });

  it("keeps a collapsed part open when the reader is inside it", () => {
    renderToc({ chapters: HAMLET, parts: ACTS, chapterIndex: 0 });
    fireEvent.click(screen.getByRole("button", { name: /^act i$/i }));
    // Never hide where the reader is.
    expect(screen.getByRole("button", { name: /^act i$/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("renders a chapter belonging to no part at top level, with no header", () => {
    renderToc({ chapters: HAMLET, parts: ACTS });
    // The epilogue has no part and no group of its own.
    expect(screen.getByRole("button", { name: "4. EPILOGUE" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^epilogue$/i })).not.toBeInTheDocument();
    const headers = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-expanded") !== null);
    expect(headers.map((h) => h.textContent)).toEqual(["ACT I", "ACT II"]);
  });

  it("gives a reused label its own group rather than merging across the book", () => {
    renderToc({
      chapters: HAMLET,
      parts: { 0: "ACT I", 1: "ACT II", 2: "ACT I" },
    });
    const headers = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-expanded") !== null);
    expect(headers.map((h) => h.textContent)).toEqual(["ACT I", "ACT II", "ACT I"]);
  });

  it("front matter and parts coexist, front matter first and closed", () => {
    renderToc({
      chapters: HAMLET,
      roles: { 0: "frontmatter" },
      parts: { 1: "ACT I", 2: "ACT II" },
    });
    const headers = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-expanded") !== null);
    expect(headers.map((h) => h.textContent)).toEqual(["Front matter", "ACT I", "ACT II"]);
    expect(headers[0]).toHaveAttribute("aria-expanded", "false");
    expect(headers[1]).toHaveAttribute("aria-expanded", "true");
  });

  it("drops a group header whose rows all fail the filter", () => {
    // The filter box only appears past 20 chapters, so this needs a real book's
    // worth of rows rather than the four-chapter fixture.
    const many = Array.from({ length: 24 }, (_, i) => ({ title: `SCENE ${i + 1}` }));
    many[23] = { title: "A room in Polonius's house." };
    const acts = Object.fromEntries(
      many.map((_, i) => [i, i < 23 ? "ACT I" : "ACT II"])
    );
    renderToc({ chapters: many, parts: acts, chapterIndex: 23 });

    fireEvent.change(screen.getByRole("searchbox", { name: /filter chapters/i }), {
      target: { value: "Polonius" },
    });
    expect(screen.getByRole("button", { name: /^act ii$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^act i$/i })).not.toBeInTheDocument();
  });

  // ── Visual hierarchy (#2745 follow-up) ────────────────────────────────────

  it("distinguishes the current chapter by weight, not colour alone", () => {
    renderToc();
    const current = screen.getByRole("button", { current: true });
    const other = screen.getByRole("button", { name: "1. CHAPTER I" });

    // The title span carries the emphasis; aria-current already carries the
    // semantics, so this guards the visible cue a sighted reader relies on.
    expect(current.querySelector("span:nth-child(2)")?.className).toContain("font-semibold");
    expect(other.querySelector("span:nth-child(2)")?.className).not.toContain("font-semibold");
  });

  it("keeps unselected titles below full-strength ink so the list is scannable", () => {
    renderToc();
    const other = screen.getByRole("button", { name: "1. CHAPTER I" });
    const title = other.querySelector("span:nth-child(2)")?.className ?? "";

    expect(title).toContain("text-stone-600");
    expect(title).not.toContain("text-ink");
  });
});

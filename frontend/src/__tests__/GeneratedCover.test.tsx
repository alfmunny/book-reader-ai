/**
 * Covers for books that arrive without art. Drawn from the record, and — the part
 * that matters — varied per book, because a shelf of identical rectangles cannot
 * be scanned and recognition is the whole job of a cover.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import GeneratedCover from "@/components/GeneratedCover";

const groundOf = (container: HTMLElement) =>
  (container.firstChild as HTMLElement).style.background;

it("shows the title", () => {
  render(<GeneratedCover title="Der Zauberberg" seed={1} />);
  expect(screen.getByText("Der Zauberberg")).toBeInTheDocument();
});

it("shows the first author", () => {
  render(<GeneratedCover title="Faust" authors={["Goethe", "Someone Else"]} seed={2} />);
  expect(screen.getByText("Goethe")).toBeInTheDocument();
});

it("omits the author line when there is none", () => {
  const { container } = render(<GeneratedCover title="Untitled work" seed={3} />);
  expect(container.querySelectorAll("p")).toHaveLength(1);
});

it("gives the same book the same cover every time", () => {
  const a = render(<GeneratedCover title="Faust" seed={2229} />);
  const b = render(<GeneratedCover title="Faust" seed={2229} />);
  expect(groundOf(a.container)).toBe(groundOf(b.container));
});

it("gives different books different covers — otherwise the shelf is unscannable", () => {
  const grounds = new Set(
    [1342, 2229, 84, 345, 1524, 76].map((id) => {
      const { container } = render(<GeneratedCover title={`Book ${id}`} seed={id} />);
      return groundOf(container);
    }),
  );
  expect(grounds.size).toBeGreaterThan(1);
});

it("falls back to the title when no seed is given", () => {
  const a = render(<GeneratedCover title="Same Title" />);
  const b = render(<GeneratedCover title="Same Title" />);
  expect(groundOf(a.container)).toBe(groundOf(b.container));
});

it("steps the title down rather than truncating it", () => {
  const long = "Aufzeichnungen aus dem Kellerloch und andere Erzählungen";
  render(<GeneratedCover title={long} seed={9} />);
  const el = screen.getByText(long);
  expect(el.className).toContain("text-[9px]");
  expect(el.className).not.toContain("truncate");
});

it("keeps a short title at full size", () => {
  render(<GeneratedCover title="Faust" seed={9} />);
  expect(screen.getByText("Faust").className).toContain("text-sm");
});

it("is decorative — the title is always beside it in the UI", () => {
  const { container } = render(<GeneratedCover title="Faust" seed={1} />);
  expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
});

it("does not crash on an empty title", () => {
  const { container } = render(<GeneratedCover title="" seed={1} />);
  expect(container.firstChild).toBeInTheDocument();
});

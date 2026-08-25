/**
 * Owner report (2026-08-25): homepage book cards render at different heights —
 * 1-line vs 2-line titles and "Last read" badges made each card its own size.
 * The library grids stretch every <li> to the row height; the card must fill
 * that cell (h-full on wrapper and button) so rows line up, with the title
 * zone absorbing the slack and author/badge pinned to the bottom.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import BookCard from "@/components/BookCard";
import type { BookMeta } from "@/lib/api";

const book: BookMeta = {
  id: 2229,
  title: "Faust",
  authors: ["Johann Wolfgang von Goethe"],
  languages: ["de"],
  subjects: [],
  download_count: 0,
  cover: null,
};

test("the card fills its grid cell so rows have uniform height", () => {
  const { container } = render(<BookCard book={book} onClick={() => {}} />);
  const wrapper = container.firstElementChild as HTMLElement;
  const card = screen.getByTestId("book-card");
  expect(wrapper.className).toContain("h-full");
  expect(card.className).toContain("h-full");
});

test("the title reserves two lines so short titles don't shrink the card", () => {
  const { container } = render(<BookCard book={book} onClick={() => {}} />);
  // The placeholder cover also prints the title — target the main title <p>
  // via its tooltip attribute.
  const title = container.querySelector('p[title="Faust"]') as HTMLElement;
  expect(title.className).toContain("min-h-[2.5rem]");
  expect(title.className).toContain("line-clamp-2");
});

test("cards with a remove button keep the same fill behavior", () => {
  const { container } = render(
    <BookCard book={book} onClick={() => {}} badge="Ch. 3 · 2h ago" onRemove={() => {}} />,
  );
  const wrapper = container.firstElementChild as HTMLElement;
  expect(wrapper.className).toContain("h-full");
});

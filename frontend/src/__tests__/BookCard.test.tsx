/**
 * Tests for components/BookCard.tsx
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BookCard from "@/components/BookCard";

const BOOK = {
  id: 1342,
  title: "Pride and Prejudice",
  authors: ["Jane Austen"],
  languages: ["en"],
  subjects: ["Fiction"],
  download_count: 50000,
  cover: "https://covers.example.com/1342.jpg",
};

test("renders book title", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} />);
  expect(screen.getByText("Pride and Prejudice")).toBeInTheDocument();
});

test("renders author name", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} />);
  expect(screen.getByText("Jane Austen")).toBeInTheDocument();
});

test("renders cover image when cover URL is provided", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} />);
  // Cover image uses alt="" (decorative — button label comes from the <p> text)
  // eslint-disable-next-line testing-library/no-container
  const { container } = render(<BookCard book={BOOK} onClick={jest.fn()} />);
  const img = container.querySelector("img");
  expect(img).not.toBeNull();
  expect(img).toHaveAttribute("src", BOOK.cover);
  expect(img).toHaveAttribute("alt", "");
});

test("draws a generated cover when there is no cover URL", () => {
  // The SVG placeholder was the same for every book, which made a shelf of
  // coverless books unscannable. A generated cover carries the title and a
  // ground colour derived from the book.
  const { container } = render(<BookCard book={{ ...BOOK, cover: "" }} onClick={jest.fn()} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  const cover = container.querySelector("[aria-hidden='true']") as HTMLElement;
  expect(cover).toBeInTheDocument();
  expect(cover.style.background).toBeTruthy();
});

test("marks a book the reader uploaded themselves", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} ownedByUser />);
  expect(screen.getByText("Your upload")).toBeInTheDocument();
});

test("library books carry no ownership badge", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} />);
  expect(screen.queryByText("Your upload")).not.toBeInTheDocument();
});

test("renders badge when provided", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} badge="Ch. 3 · 2h ago" />);
  expect(screen.getByText("Ch. 3 · 2h ago")).toBeInTheDocument();
});

test("does not render badge when not provided", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} />);
  expect(screen.queryByText(/Ch\./)).not.toBeInTheDocument();
});

test("calls onClick when clicked", async () => {
  const onClick = jest.fn();
  render(<BookCard book={BOOK} onClick={onClick} />);
  await userEvent.click(screen.getByRole("button"));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test("renders multiple authors joined by comma", () => {
  render(<BookCard book={{ ...BOOK, authors: ["Author A", "Author B"] }} onClick={jest.fn()} />);
  expect(screen.getByText("Author A, Author B")).toBeInTheDocument();
});

// ── onRemove branch ────────────────────────────────────────────────────────────

const REMOVE_LABEL = `Remove ${BOOK.title} from library`;

test("does not render remove button when onRemove is not provided", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} />);
  expect(screen.queryByRole("button", { name: REMOVE_LABEL })).not.toBeInTheDocument();
});

test("renders remove button when onRemove is provided", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} onRemove={jest.fn()} />);
  expect(screen.getByRole("button", { name: REMOVE_LABEL })).toBeInTheDocument();
});

test("calls onRemove when remove button is clicked", async () => {
  const onRemove = jest.fn();
  const onClick = jest.fn();
  render(<BookCard book={BOOK} onClick={onClick} onRemove={onRemove} />);

  const removeBtn = screen.getByRole("button", { name: REMOVE_LABEL });
  await userEvent.click(removeBtn);

  expect(onRemove).toHaveBeenCalledTimes(1);
  // The main card onClick must NOT fire — stopPropagation is called
  expect(onClick).not.toHaveBeenCalled();
});

test("remove button meets 44px minimum touch target size", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} onRemove={jest.fn()} />);
  const removeBtn = screen.getByRole("button", { name: REMOVE_LABEL });
  expect(removeBtn.className).toContain("min-w-[44px]");
  expect(removeBtn.className).toContain("min-h-[44px]");
});

// ── aria-label on main card button (#1963) ─────────────────────────────────────

test("main card button has aria-label announcing the open action and book title", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} />);
  // When onRemove is absent there is only one button — the card itself.
  const card = screen.getByRole("button", { name: `Open ${BOOK.title} by ${BOOK.authors[0]}` });
  expect(card).toBeInTheDocument();
});

test("main card button aria-label omits 'by ...' when no authors", () => {
  render(<BookCard book={{ ...BOOK, authors: [] }} onClick={jest.fn()} />);
  const card = screen.getByRole("button", { name: `Open ${BOOK.title}` });
  expect(card).toBeInTheDocument();
});

test("main card button aria-label joins multiple authors", () => {
  render(
    <BookCard book={{ ...BOOK, authors: ["Author A", "Author B"] }} onClick={jest.fn()} />,
  );
  const card = screen.getByRole("button", { name: "Open Pride and Prejudice by Author A, Author B" });
  expect(card).toBeInTheDocument();
});

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
  const img = screen.getByRole("img", { name: "Pride and Prejudice" });
  expect(img).toHaveAttribute("src", BOOK.cover);
});

test("renders placeholder emoji when no cover URL", () => {
  const { container } = render(<BookCard book={{ ...BOOK, cover: "" }} onClick={jest.fn()} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(container.textContent).toContain("📖");
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

test("does not render remove button when onRemove is not provided", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} />);
  expect(screen.queryByRole("button", { name: /remove from library/i })).not.toBeInTheDocument();
});

test("renders remove button when onRemove is provided", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} onRemove={jest.fn()} />);
  expect(screen.getByRole("button", { name: /remove from library/i })).toBeInTheDocument();
});

test("calls onRemove when remove button is clicked", async () => {
  const onRemove = jest.fn();
  const onClick = jest.fn();
  render(<BookCard book={BOOK} onClick={onClick} onRemove={onRemove} />);

  const removeBtn = screen.getByRole("button", { name: /remove from library/i });
  await userEvent.click(removeBtn);

  expect(onRemove).toHaveBeenCalledTimes(1);
  // The main card onClick must NOT fire — stopPropagation is called
  expect(onClick).not.toHaveBeenCalled();
});

test("remove button meets 44px minimum touch target size", () => {
  render(<BookCard book={BOOK} onClick={jest.fn()} onRemove={jest.fn()} />);
  const removeBtn = screen.getByRole("button", { name: /remove from library/i });
  expect(removeBtn.className).toContain("min-w-[44px]");
  expect(removeBtn.className).toContain("min-h-[44px]");
});

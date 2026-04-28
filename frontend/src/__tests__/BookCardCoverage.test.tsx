/**
 * Coverage tests for components/BookCard.tsx — functions not covered by existing tests.
 * Closes #1987 — targets: onMouseLeave shadow reset (line 38), onBlur shadow reset (line 40).
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import BookCard from "@/components/BookCard";

const BOOK = {
  id: 1,
  title: "The Call of the Wild",
  authors: ["Jack London"],
  cover: null,
  gutenberg_id: 215,
  language: "en",
};

test("onMouseLeave resets box-shadow to --shadow-card after hover", () => {
  const { getByTestId } = render(<BookCard book={BOOK} onClick={jest.fn()} />);
  const btn = getByTestId("book-card");

  fireEvent.mouseEnter(btn);
  expect(btn.style.boxShadow).toBe("var(--shadow-card-hover)");

  fireEvent.mouseLeave(btn);
  expect(btn.style.boxShadow).toBe("var(--shadow-card)");
});

test("onBlur resets box-shadow to --shadow-card after focus", () => {
  const { getByTestId } = render(<BookCard book={BOOK} onClick={jest.fn()} />);
  const btn = getByTestId("book-card");

  fireEvent.focus(btn);
  expect(btn.style.boxShadow).toBe("var(--shadow-card-hover)");

  fireEvent.blur(btn);
  expect(btn.style.boxShadow).toBe("var(--shadow-card)");
});

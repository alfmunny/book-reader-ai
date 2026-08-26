/**
 * VocabExportDialog — pick grouping (A–Z / Language / Book / Recent) and scope
 * (all books, one book, one language) before downloading the markdown.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VocabExportDialog from "@/components/VocabExportDialog";
import type { VocabularyWord } from "@/lib/api";

const WORDS = [
  {
    id: 1, word: "ephemeral", language: "en", created_at: "2026-01-01T00:00:00",
    occurrences: [{ book_id: 10, book_title: "Moby Dick", chapter_index: 2, sentence_text: "The ephemeral whale." }],
  },
  {
    id: 2, word: "verhöhnen", language: "de", created_at: "2026-02-01T00:00:00",
    occurrences: [{ book_id: 20, book_title: "Faust", chapter_index: 0, sentence_text: "Er wurde verhöhnt." }],
  },
] as VocabularyWord[];

function setup() {
  const onDownload = jest.fn();
  const onClose = jest.fn();
  render(<VocabExportDialog words={WORDS} onDownload={onDownload} onClose={onClose} />);
  return { onDownload, onClose };
}

test("is a labelled modal dialog", () => {
  setup();
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(dialog).toHaveAccessibleName(/export vocabulary/i);
});

test("offers all four groupings, with A–Z selected by default", () => {
  setup();
  for (const label of ["A–Z", "Language", "Book", "Recent"]) {
    expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
  }
  expect(screen.getByRole("radio", { name: "A–Z" })).toBeChecked();
});

test("lists every book that has saved words, plus an all-books default", () => {
  setup();
  const books = screen.getByRole("combobox", { name: "Books" }) as HTMLSelectElement;
  const labels = Array.from(books.options).map((o) => o.textContent);
  expect(labels).toEqual(expect.arrayContaining(["All books", "Moby Dick", "Faust"]));
  expect(books.value).toBe("all");
});

test("lists every language present, plus an all-languages default", () => {
  setup();
  const langs = screen.getByRole("combobox", { name: "Language" }) as HTMLSelectElement;
  const labels = Array.from(langs.options).map((o) => o.textContent);
  expect(labels).toEqual(expect.arrayContaining(["All languages", "en", "de"]));
  expect(langs.value).toBe("all");
});

test("downloads with the defaults — A–Z, everything", async () => {
  const { onDownload } = setup();
  await userEvent.click(screen.getByRole("button", { name: /^download$/i }));

  expect(onDownload).toHaveBeenCalledWith({ groupBy: "alpha", bookId: null, language: null });
});

test("passes the chosen grouping and scope", async () => {
  const { onDownload } = setup();

  await userEvent.click(screen.getByRole("radio", { name: "Recent" }));
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Books" }), "20");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "de");
  await userEvent.click(screen.getByRole("button", { name: /^download$/i }));

  expect(onDownload).toHaveBeenCalledWith({ groupBy: "recent", bookId: 20, language: "de" });
});

test("Cancel closes without downloading", async () => {
  const { onDownload, onClose } = setup();
  await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onDownload).not.toHaveBeenCalled();
});

test("Escape closes without downloading", async () => {
  const { onDownload, onClose } = setup();
  await userEvent.keyboard("{Escape}");

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onDownload).not.toHaveBeenCalled();
});

test("controls meet the 44px mobile touch target", () => {
  setup();
  expect(screen.getByRole("button", { name: /^download$/i }).className).toContain("min-h-[44px]");
  expect(screen.getByRole("button", { name: /cancel/i }).className).toContain("min-h-[44px]");
});

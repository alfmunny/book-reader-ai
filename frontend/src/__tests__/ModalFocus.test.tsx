/**
 * Modal focus management — focus moves to dialog on open, restored on close.
 * Closes #1095
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import AuthPromptModal from "@/components/AuthPromptModal";
import BookDetailModal from "@/components/BookDetailModal";
import type { BookMeta } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  getBookTranslationStatus: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/settings", () => ({
  getSettings: () => ({ translationLang: "en" }),
}));

const BOOK: BookMeta = {
  id: 1,
  title: "Test Book",
  authors: ["Author"],
  languages: ["en"],
  subjects: [],
  download_count: 0,
  cover: null,
};

describe("AuthPromptModal focus management", () => {
  it("moves focus to the dialog when opened", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    render(<AuthPromptModal open feature="translate" onClose={jest.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(dialog);
    document.body.removeChild(trigger);
  });

  it("restores focus to previously focused element on unmount", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(<AuthPromptModal open feature="translate" onClose={jest.fn()} />);
    unmount();

    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});

describe("BookDetailModal focus management", () => {
  it("moves focus to the dialog when opened", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    render(<BookDetailModal book={BOOK} recentBook={null} onClose={jest.fn()} onRead={jest.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(dialog);
    document.body.removeChild(trigger);
  });

  it("restores focus to previously focused element on unmount", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <BookDetailModal book={BOOK} recentBook={null} onClose={jest.fn()} onRead={jest.fn()} />,
    );
    unmount();

    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});

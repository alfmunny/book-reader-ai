/**
 * The app-wide note dialog carries the same visibility control as the
 * shared-notes panel (owner, 2026-08-29): one note UI everywhere.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  createAnnotation: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
}));

import * as api from "@/lib/api";
import AnnotationToolbar from "@/components/AnnotationToolbar";

const SAVED = { id: 7, book_id: 1, chapter_index: 0, sentence_text: "S", note_text: "n", color: "yellow" };

beforeEach(() => jest.clearAllMocks());

test("new notes default to Public and report the choice on save", async () => {
  (api.createAnnotation as jest.Mock).mockResolvedValue(SAVED);
  const onVisibilityChange = jest.fn().mockResolvedValue(undefined);
  render(
    <AnnotationToolbar
      sentenceText="S" chapterIndex={0} bookId={1}
      onClose={jest.fn()} onSaved={jest.fn()} onDeleted={jest.fn()}
      onVisibilityChange={onVisibilityChange}
    />,
  );
  expect((screen.getByLabelText("Visibility") as HTMLSelectElement).value).toBe("public");
  fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: "my thought" } });
  fireEvent.click(screen.getByRole("button", { name: "Save note" }));
  await waitFor(() => expect(onVisibilityChange).toHaveBeenCalledWith(SAVED, true));
});

test("an existing private note keeps Private, and can be published from here", async () => {
  (api.updateAnnotation as jest.Mock).mockResolvedValue(SAVED);
  const onVisibilityChange = jest.fn().mockResolvedValue(undefined);
  render(
    <AnnotationToolbar
      sentenceText="S" chapterIndex={0} bookId={1}
      existingAnnotation={{ id: 7, note_text: "n", color: "yellow" }}
      initialVisibility="private"
      onClose={jest.fn()} onSaved={jest.fn()} onDeleted={jest.fn()}
      onVisibilityChange={onVisibilityChange}
    />,
  );
  expect((screen.getByLabelText("Visibility") as HTMLSelectElement).value).toBe("private");
  fireEvent.change(screen.getByLabelText("Visibility"), { target: { value: "public" } });
  fireEvent.click(screen.getByRole("button", { name: "Update" }));
  await waitFor(() => expect(onVisibilityChange).toHaveBeenCalledWith(SAVED, true));
});

test("without the handler the dialog stays exactly as before", () => {
  render(
    <AnnotationToolbar
      sentenceText="S" chapterIndex={0} bookId={1}
      onClose={jest.fn()} onSaved={jest.fn()} onDeleted={jest.fn()}
    />,
  );
  expect(screen.queryByLabelText("Visibility")).toBeNull();
});

/**
 * An uploaded book can be discarded from the bookshelf (#2789 follow-up).
 *
 * `DELETE /upload/{id}` and `deleteUploadedBook()` both existed, but nothing in
 * the UI called them — and the admin books list excludes uploads by design
 * (`source != 'upload'`), so its Delete button could never reach one. An
 * unconfirmed upload was therefore impossible to remove from any screen.
 */
import React from "react";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { backendToken: "t" } }),
}));

const mockDeleteUploadedBook = jest.fn();
const mockGetDraftAudits = jest.fn();
jest.mock("@/lib/api", () => ({
  getMe: jest.fn().mockResolvedValue({ id: 1, name: "U" }),
  getReadingProgress: jest.fn().mockResolvedValue([]),
  getUserStats: jest.fn().mockResolvedValue(null),
  getMyUploads: jest.fn().mockResolvedValue([]),
  getDraftAudits: (...a: unknown[]) => mockGetDraftAudits(...a),
  deleteUploadedBook: (...a: unknown[]) => mockDeleteUploadedBook(...a),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
  },
}));

jest.mock("@/lib/recentBooks", () => ({
  getRecentBooks: jest.fn().mockReturnValue([]),
  removeRecentBook: jest.fn(),
  recordRecentBook: jest.fn(),
}));

import BookshelfPage from "@/app/(shell)/bookshelf/page";

const DRAFT = {
  book_id: 1000002,
  title: "Broken Upload",
  authors: ["Unknown"],
  chapter_count: 2,
  reviewed_count: 0,
};

const flush = () => new Promise((r) => setTimeout(r, 0));

async function renderShelf() {
  mockGetDraftAudits.mockResolvedValue([DRAFT]);
  render(<BookshelfPage />);
  await flush();
  return await screen.findByRole("list", { name: /still reviewing/i });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleteUploadedBook.mockResolvedValue({ ok: true });
});

test("an in-progress upload offers a way to discard it", async () => {
  const list = await renderShelf();

  expect(within(list).getByRole("button", { name: /discard .*Broken Upload/i })).toBeInTheDocument();
});

test("discarding asks first — it destroys chapters and any notes", async () => {
  const list = await renderShelf();

  await userEvent.click(within(list).getByRole("button", { name: /discard .*Broken Upload/i }));

  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(mockDeleteUploadedBook).not.toHaveBeenCalled();
});

test("confirming deletes the book", async () => {
  const list = await renderShelf();
  await userEvent.click(within(list).getByRole("button", { name: /discard .*Broken Upload/i }));

  await userEvent.click(screen.getByRole("button", { name: /^confirm/i }));

  expect(mockDeleteUploadedBook).toHaveBeenCalledWith(1000002);
});

test("cancelling leaves the book alone", async () => {
  const list = await renderShelf();
  await userEvent.click(within(list).getByRole("button", { name: /discard .*Broken Upload/i }));

  await userEvent.click(screen.getByRole("button", { name: /^cancel/i }));

  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(mockDeleteUploadedBook).not.toHaveBeenCalled();
});

test("a deleted book leaves the list without a reload", async () => {
  const list = await renderShelf();
  await userEvent.click(within(list).getByRole("button", { name: /discard .*Broken Upload/i }));
  await userEvent.click(screen.getByRole("button", { name: /^confirm/i }));

  // The whole "In progress" section disappears once the last draft is gone,
  // so absence of the row is the observable outcome.
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /discard .*Broken Upload/i })).not.toBeInTheDocument(),
  );
  expect(mockGetDraftAudits).toHaveBeenCalledTimes(1); // no refetch
});

test("a failed delete says so and keeps the book", async () => {
  mockDeleteUploadedBook.mockRejectedValue(new Error("Book not found"));
  const list = await renderShelf();
  await userEvent.click(within(list).getByRole("button", { name: /discard .*Broken Upload/i }));

  await userEvent.click(screen.getByRole("button", { name: /^confirm/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/book not found/i);
  // GeneratedCover paints the title too, so assert on the row's own control.
  expect(screen.getByRole("button", { name: /discard .*Broken Upload/i })).toBeInTheDocument();
});

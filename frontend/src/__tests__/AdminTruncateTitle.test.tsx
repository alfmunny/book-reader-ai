/**
 * Regression test for #1957: truncated text in admin tables must have
 * title attributes so users can hover to reveal full content.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockAdminFetch = jest.fn();
jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

jest.mock("@/lib/api", () => ({
  getMe: () => Promise.resolve({ id: 99 }),
}));

jest.mock("@/components/SeedPopularButton", () => {
  const Seed = () => <button>Seed</button>;
  Seed.displayName = "SeedPopularButton";
  return { __esModule: true, default: Seed };
});

beforeEach(() => {
  jest.resetAllMocks();
});

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

// --- admin/uploads ---
import UploadsPage from "@/app/admin/uploads/page";

const UPLOAD = {
  book_id: 1,
  title: "A Very Long Book Title That Will Definitely Get Truncated In The Table",
  filename: "very-long-filename-that-also-gets-truncated.epub",
  file_size: 1048576,
  format: "epub",
  uploaded_at: "2026-01-01T00:00:00Z",
  uploader_email: "user@example.com",
  uploader_name: "Test User",
};

test("uploads table: truncated title and filename have title attributes", async () => {
  mockAdminFetch.mockResolvedValue([UPLOAD]);
  render(<UploadsPage />);
  await flushPromises();

  await screen.findByText(UPLOAD.title);

  const titleCell = screen.getByText(UPLOAD.title).closest("td");
  expect(titleCell).not.toBeNull();
  expect(titleCell!.getAttribute("title")).toBe(UPLOAD.title);

  const filenameCell = screen.getByText(UPLOAD.filename).closest("td");
  expect(filenameCell).not.toBeNull();
  expect(filenameCell!.getAttribute("title")).toBe(UPLOAD.filename);
});

// --- admin/users ---
import UsersPage from "@/app/admin/users/page";

const USER = {
  id: 1,
  email: "a-very-long-email-address-that-truncates@example-domain.com",
  name: "A Very Long Name That Will Truncate In The List View",
  picture: "",
  role: "user",
  approved: 1,
  created_at: "2026-01-01T00:00:00Z",
};

test("users list: truncated name and email have title attributes", async () => {
  mockAdminFetch.mockResolvedValue([USER]);
  render(<UsersPage />);
  await flushPromises();

  await screen.findByText(USER.name);

  const nameEl = screen.getByText(USER.name);
  expect(nameEl.getAttribute("title")).toBe(USER.name);

  const emailEl = screen.getByText(USER.email);
  expect(emailEl.getAttribute("title")).toBe(USER.email);
});

// --- admin/books ---
import BooksPage from "@/app/admin/books/page";

const BOOK_STATS = { total_books: 1, total_translations: 0, failed_translations: 0 };
const BOOK = {
  id: 1,
  title: "A Very Long Book Title That Gets Truncated In The Admin Books Panel",
  active: false,
  active_language: null,
  translations: {},
};

test("books list: truncated title has title attribute", async () => {
  mockAdminFetch
    .mockResolvedValueOnce([BOOK])          // /admin/books
    .mockResolvedValueOnce(BOOK_STATS);     // /admin/translations
  render(<BooksPage />);
  await flushPromises();

  await screen.findByText(BOOK.title);

  const titleEl = screen.getByText(BOOK.title);
  expect(titleEl.getAttribute("title")).toBe(BOOK.title);
});

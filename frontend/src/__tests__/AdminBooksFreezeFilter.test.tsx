/**
 * Admin books list: audit state is visible and filterable.
 *
 * The page already badged "not audited" and "awaiting review", but a book that
 * was frozen *and* published carried no state badge at all — you inferred it
 * from the presence of a "Remove from library" button. And the only filter was
 * free-text over title/author/id, so "show me everything frozen" meant reading
 * the whole list.
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAdminFetch = jest.fn();

jest.mock("@/components/PendingPublishPanel", () => {
  const P = () => null;
  P.displayName = "PendingPublishPanel";
  return { __esModule: true, default: P };
});
jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/components/SeedPopularButton", () => {
  const S = () => <button>Seed popular</button>;
  S.displayName = "SeedPopularButton";
  return { __esModule: true, default: S };
});

let BooksPage: React.ComponentType;
beforeAll(async () => {
  BooksPage = (await import("@/app/admin/books/page")).default;
});
beforeEach(() => jest.clearAllMocks());

const base = { authors: [], languages: ["en"], download_count: 0, text_length: 1, word_count: 1, translations: {}, queue: {} };
const BOOKS = [
  { ...base, id: 1, title: "Not Audited Book" },
  { ...base, id: 2, title: "Awaiting Book", frozen: true, published: false, frozen_at: "2026-08-20", audited_by: "architect" },
  { ...base, id: 3, title: "Library Book", frozen: true, published: true, frozen_at: "2026-08-21", audited_by: "dev" },
];

const flush = () => new Promise((r) => setTimeout(r, 0));

async function renderPage() {
  mockAdminFetch.mockResolvedValueOnce(BOOKS).mockResolvedValueOnce([]);
  render(<BooksPage />);
  await flush();
  return await screen.findByRole("list", { name: "Books" });
}

function titles(list: HTMLElement): string[] {
  return BOOKS.map((b) => b.title).filter((t) => within(list).queryByText(t) !== null);
}

test("a frozen, published book is badged rather than left blank", async () => {
  const list = await renderPage();
  const badge = within(list).getByText(/frozen · in library/i);

  expect(badge).toBeInTheDocument();
  expect(badge).toHaveAttribute("title", expect.stringContaining("2026-08-21"));
  expect(badge).toHaveAttribute("title", expect.stringContaining("dev"));
});

test("the three audit states each keep their own badge", async () => {
  const list = await renderPage();

  expect(within(list).getByText("not audited")).toBeInTheDocument();
  expect(within(list).getByText("awaiting review")).toBeInTheDocument();
  expect(within(list).getByText(/frozen · in library/i)).toBeInTheDocument();
});

test("the filter defaults to showing every book", async () => {
  const list = await renderPage();

  expect(screen.getByRole("combobox", { name: /audit state/i })).toHaveValue("all");
  expect(titles(list)).toEqual(["Not Audited Book", "Awaiting Book", "Library Book"]);
});

test("filtering by frozen shows both frozen states and hides the rest", async () => {
  const list = await renderPage();

  await userEvent.selectOptions(screen.getByRole("combobox", { name: /audit state/i }), "frozen");

  expect(titles(list)).toEqual(["Awaiting Book", "Library Book"]);
});

test("filtering by awaiting review isolates the publish queue", async () => {
  const list = await renderPage();

  await userEvent.selectOptions(screen.getByRole("combobox", { name: /audit state/i }), "awaiting");

  expect(titles(list)).toEqual(["Awaiting Book"]);
});

test("filtering by in library isolates published books", async () => {
  const list = await renderPage();

  await userEvent.selectOptions(screen.getByRole("combobox", { name: /audit state/i }), "published");

  expect(titles(list)).toEqual(["Library Book"]);
});

test("filtering by not audited isolates books with no freeze", async () => {
  const list = await renderPage();

  await userEvent.selectOptions(screen.getByRole("combobox", { name: /audit state/i }), "unaudited");

  expect(titles(list)).toEqual(["Not Audited Book"]);
});

test("the state filter and the search box narrow together", async () => {
  const list = await renderPage();

  await userEvent.selectOptions(screen.getByRole("combobox", { name: /audit state/i }), "frozen");
  await userEvent.type(screen.getByRole("searchbox", { name: /filter books/i }), "Library");

  expect(titles(list)).toEqual(["Library Book"]);
});

test("a state with no books says so instead of showing an empty list", async () => {
  mockAdminFetch.mockResolvedValueOnce([BOOKS[0]]).mockResolvedValueOnce([]);
  render(<BooksPage />);
  await screen.findByRole("list", { name: "Books" });

  await userEvent.selectOptions(screen.getByRole("combobox", { name: /audit state/i }), "published");

  expect(screen.getByText(/no books match/i)).toBeInTheDocument();
});

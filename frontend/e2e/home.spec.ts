/**
 * E2E: Home (the curated catalog) and Your Bookshelf.
 *
 * Readers no longer import books themselves, so the Gutenberg search and the
 * Discover tab it lived in are gone (#2711). Home lists the audited catalog; the
 * personal collection moved to /bookshelf.
 */
import { test, expect } from "./base";
import { mockBackend, MOCK_BOOK } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test("home page renders the header and the catalog", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Book Reader AI" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The Library" })).toBeVisible();
  await expect(page.getByRole("list", { name: "The Library" })).toBeVisible();
});

test("home lists the audited books", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Pride and Prejudice").first()).toBeVisible();
  await expect(page.getByText("Faust").first()).toBeVisible();
});

test("home no longer offers a Gutenberg search", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByPlaceholder(/Search by title or author/)).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);
});

test("bookshelf shows books from localStorage recentBooks", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((book) => {
    localStorage.setItem("recent_books", JSON.stringify([
      { ...book, lastRead: Date.now(), lastChapter: 2 },
    ]));
  }, MOCK_BOOK);

  await page.goto("/bookshelf");
  await expect(page.getByText("Pride and Prejudice").first()).toBeVisible();
  await expect(page.getByText(/Ch\. 3/)).toBeVisible(); // badge with chapter
});

test("empty bookshelf shows a message and a route back to the library", async ({ page }) => {
  await page.goto("/bookshelf");
  await expect(page.getByText(/Your bookshelf is empty/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Browse the library/i })).toBeVisible();
});

test("the empty-bookshelf CTA returns to the catalog", async ({ page }) => {
  await page.goto("/bookshelf");
  await page.getByRole("link", { name: /Browse the library/i }).click();
  await expect(page.getByRole("heading", { name: "The Library" })).toBeVisible();
});

test("clicking a bookshelf book opens its detail modal", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((book) => {
    localStorage.setItem("recent_books", JSON.stringify([
      { ...book, lastRead: Date.now(), lastChapter: 0 },
    ]));
  }, MOCK_BOOK);

  await page.goto("/bookshelf");
  await page.getByRole("button").filter({ hasText: "Austen" }).first().click();
  await expect(page.getByRole("heading", { name: "Pride and Prejudice" })).toBeVisible();
});

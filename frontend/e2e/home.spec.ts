/**
 * E2E: Home page user flows
 */
import { test, expect } from "@playwright/test";
import { mockBackend } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test("home page renders header and search input", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Book Reader AI" })).toBeVisible();
  await expect(page.getByPlaceholder(/Search by title or author/)).toBeVisible();
});

test("shows cached library from backend", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Your Library")).toBeVisible();
  await expect(page.getByText("Pride and Prejudice").first()).toBeVisible();
});

test("search for Faust returns result and displays it", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Search by title or author/).fill("Faust");
  await page.getByRole("button", { name: "Search" }).click();
  // Book title appears in search results
  await expect(page.getByText("Faust").first()).toBeVisible();
});

test("quick search pill triggers search", async ({ page }) => {
  await page.goto("/");
  // Use Faust — not in the cached library, so clicking the pill really does
  // trigger a search (instead of matching a pre-existing BookCard).
  await page.getByRole("button", { name: "Faust" }).click();
  // Mocked search returns Goethe as the author
  await expect(page.getByText(/Goethe/)).toBeVisible();
});

test("clicking a book navigates to reader page", async ({ page }) => {
  await page.goto("/");
  // Scope to buttons that contain the author text — BookCards wrap both
  // title and author, while quick-search pills only contain the title.
  // This avoids ambiguity between the "Pride and Prejudice" pill and card.
  await page.getByRole("button").filter({ hasText: "Jane Austen" }).first().click();
  await page.waitForURL(/\/reader\/1342/);
  expect(page.url()).toContain("/reader/1342");
});

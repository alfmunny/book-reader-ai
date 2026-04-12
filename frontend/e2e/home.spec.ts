/**
 * E2E: Home page user flows
 */
import { test, expect } from "@playwright/test";
import { mockBackend, MOCK_BOOK } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test("home page renders header and search input", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Book Reader AI" })).toBeVisible();
  await expect(page.getByPlaceholder(/Search by title or author/)).toBeVisible();
});

test("Your Library shows books from localStorage recentBooks", async ({ page }) => {
  // Seed a recent book in localStorage (simulates a book the user has opened)
  await page.goto("/");
  await page.evaluate((book) => {
    localStorage.setItem("recent_books", JSON.stringify([
      { ...book, lastRead: Date.now(), lastChapter: 2 },
    ]));
  }, MOCK_BOOK);
  await page.reload();

  await expect(page.getByText("Your Library")).toBeVisible();
  await expect(page.getByText("Pride and Prejudice").first()).toBeVisible();
  await expect(page.getByText(/Ch\. 3/)).toBeVisible(); // badge with chapter
});

test("Your Library is hidden when no recent books", async ({ page }) => {
  await page.goto("/");
  // No recent books in localStorage → library section should not appear
  await expect(page.getByText("Your Library")).not.toBeVisible();
});

test("search for Faust returns result and displays it", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Search by title or author/).fill("Faust");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Faust").first()).toBeVisible();
});

test("quick search pill triggers search", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Faust" }).click();
  await expect(page.getByText(/Goethe/)).toBeVisible();
});

test("clicking a library book navigates to reader page", async ({ page }) => {
  // Seed a recent book so the library shows up
  await page.goto("/");
  await page.evaluate((book) => {
    localStorage.setItem("recent_books", JSON.stringify([
      { ...book, lastRead: Date.now(), lastChapter: 0 },
    ]));
  }, MOCK_BOOK);
  await page.reload();

  // Click the BookCard (contains author text, unlike search pills)
  await page.getByRole("button").filter({ hasText: "Jane Austen" }).first().click();
  await page.waitForURL(/\/reader\/1342/);
  expect(page.url()).toContain("/reader/1342");
});

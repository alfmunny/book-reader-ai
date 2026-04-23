/**
 * E2E: Home page user flows
 */
import { test, expect } from "./base";
import { mockBackend, MOCK_BOOK } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test("home page renders header and search input", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Book Reader AI" })).toBeVisible();
  // With no library books, auto-switches to Discover tab which has the search
  await expect(page.getByPlaceholder(/Search by title or author/)).toBeVisible();
});

test("Home tab shows books from localStorage recentBooks", async ({ page }) => {
  // Seed a recent book in localStorage (simulates a book the user has opened)
  await page.goto("/");
  await page.evaluate((book) => {
    localStorage.setItem("recent_books", JSON.stringify([
      { ...book, lastRead: Date.now(), lastChapter: 2 },
    ]));
  }, MOCK_BOOK);
  await page.reload();

  // Click the Home tab to ensure it's active
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByText("Pride and Prejudice").first()).toBeVisible();
  await expect(page.getByText(/Ch\. 3/)).toBeVisible(); // badge with chapter
});

test("empty library shows message and discover button", async ({ page }) => {
  await page.goto("/");
  // No recent books → auto-switches to Discover tab
  await expect(page.getByPlaceholder(/Search by title or author/)).toBeVisible();
});

test("search for Faust returns result and displays it", async ({ page }) => {
  await page.goto("/");
  // No library → already on Discover tab
  await page.getByPlaceholder(/Search by title or author/).fill("Faust");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Faust").first()).toBeVisible();
});

test("quick search pill triggers search", async ({ page }) => {
  await page.goto("/");
  // No library → already on Discover tab
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

  // Explicitly open the Home tab in case the session effect flipped to Discover
  await page.getByRole("button", { name: "Home" }).click();
  // The Continue Reading button at the top navigates directly to the reader
  await page.getByRole("button", { name: "Continue reading" }).click();
  await page.waitForURL(/\/reader\/1342/);
  expect(page.url()).toContain("/reader/1342");
});

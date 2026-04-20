/**
 * E2E: Book detail modal — opens, shows book info, navigates on CTA
 */
import { test, expect } from "./base";
import { mockBackend, MOCK_BOOK, MOCK_FAUST } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
  // Mock popular books so the Discover tab has clickable cards
  await page.route("**/api/books/popular*", (route) =>
    route.fulfill({
      json: { books: [MOCK_BOOK, MOCK_FAUST], total: 2, page: 1, per_page: 50 },
    })
  );
  // Mock reading progress for authenticated user
  await page.route("**/api/user/reading-progress", (route) =>
    route.fulfill({ json: { entries: [] } })
  );
});

test("clicking a search result opens the book detail modal", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Search by title or author/).fill("Faust");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Faust").first()).toBeVisible();

  await page.getByRole("button").filter({ hasText: "Goethe" }).first().click();

  await expect(page.getByRole("heading", { name: "Faust" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start Reading/ })).toBeVisible();
});

test("modal shows Continue Reading for a book in the library", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((book) => {
    localStorage.setItem("recent_books", JSON.stringify([
      { ...book, lastRead: Date.now(), lastChapter: 3 },
    ]));
  }, MOCK_BOOK);
  await page.reload();

  await page.getByRole("button", { name: "Your Library" }).click();
  const bookCard = page.getByRole("button").filter({ hasText: "Jane Austen" });
  await bookCard.click();

  await expect(page.getByRole("button", { name: /Continue Reading.*Ch\. 4/ })).toBeVisible();
});

test("modal CTA navigates to reader", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Search by title or author/).fill("Faust");
  await page.getByRole("button", { name: "Search" }).click();

  await page.getByRole("button").filter({ hasText: "Goethe" }).first().click();
  await page.getByRole("button", { name: /Start Reading/ }).click();

  await page.waitForURL(/\/reader\/|\/import\//);
  expect(page.url()).toMatch(/reader\/2229|import\/2229/);
});

test("modal closes when clicking the close button", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Search by title or author/).fill("Faust");
  await page.getByRole("button", { name: "Search" }).click();

  await page.getByRole("button").filter({ hasText: "Goethe" }).first().click();
  await expect(page.getByRole("heading", { name: "Faust" })).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: "Faust" })).not.toBeVisible();
});

test("modal closes on Escape key", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Search by title or author/).fill("Faust");
  await page.getByRole("button", { name: "Search" }).click();

  await page.getByRole("button").filter({ hasText: "Goethe" }).first().click();
  await expect(page.getByRole("heading", { name: "Faust" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Faust" })).not.toBeVisible();
});

test("modal shows language tag for the book", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Search by title or author/).fill("Faust");
  await page.getByRole("button", { name: "Search" }).click();

  await page.getByRole("button").filter({ hasText: "Goethe" }).first().click();

  // MOCK_FAUST has language "de" → should show "German" tag in the modal
  await expect(page.locator("span").filter({ hasText: "German" })).toBeVisible();
});

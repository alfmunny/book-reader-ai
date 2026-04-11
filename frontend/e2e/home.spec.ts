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
  await expect(page.getByPlaceholder(/Search Project Gutenberg/)).toBeVisible();
});

test("shows cached library from backend", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Your Library")).toBeVisible();
  await expect(page.getByText("Pride and Prejudice").first()).toBeVisible();
});

test("search for Faust returns result and displays it", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Search Project Gutenberg/).fill("Faust");
  await page.getByRole("button", { name: "Search" }).click();
  // Book title appears in search results
  await expect(page.getByText("Faust").first()).toBeVisible();
});

test("quick search pill triggers search", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pride and Prejudice" }).first().click();
  await expect(page.getByText("Jane Austen").first()).toBeVisible();
});

test("clicking a book navigates to reader page", async ({ page }) => {
  await page.goto("/");
  // Click first book card in the library
  await page.getByText("Pride and Prejudice").first().click();
  await page.waitForURL(/\/reader\/1342/);
  expect(page.url()).toContain("/reader/1342");
});

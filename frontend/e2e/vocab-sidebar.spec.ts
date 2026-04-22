/**
 * E2E: Vocab sidebar — chapter filter toggle and vocabulary page highlight.
 */
import { test, expect } from "./base";
import { mockBackend } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test("vocab sidebar opens with 'This chapter' and 'All chapters' toggles", async ({ page }) => {
  await page.goto("/reader/1342");

  const vocabBtn = page.getByTitle("Vocabulary");
  await vocabBtn.click();

  await expect(page.getByRole("button", { name: "This chapter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All chapters" })).toBeVisible();
});

test("vocab sidebar chapter filter: default shows only chapter-0 word", async ({ page }) => {
  await page.goto("/reader/1342");

  const vocabBtn = page.getByTitle("Vocabulary");
  await vocabBtn.click();

  // "universally" is chapter 0 — should be visible in default "This chapter" view
  await expect(page.getByRole("button", { name: /universally/i })).toBeVisible();
  // "acknowledged" is chapter 1 — should be hidden
  await expect(page.getByRole("button", { name: /acknowledged/i })).not.toBeVisible();
});

test("vocab sidebar 'All chapters' toggle shows words from every chapter", async ({ page }) => {
  await page.goto("/reader/1342");

  const vocabBtn = page.getByTitle("Vocabulary");
  await vocabBtn.click();

  // Switch to all chapters
  await page.getByRole("button", { name: "All chapters" }).click();

  await expect(page.getByRole("button", { name: /universally/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /acknowledged/i })).toBeVisible();
});

test("vocab page: target word card has amber highlight ring", async ({ page }) => {
  await page.goto("/vocabulary?word=universally");

  // Wait for the word card to appear
  await expect(page.getByText("universal").first()).toBeVisible({ timeout: 5000 });

  // The card should have the ring-2 highlight class
  const card = page.locator("[class*='ring-2']").first();
  await expect(card).toBeVisible();
});

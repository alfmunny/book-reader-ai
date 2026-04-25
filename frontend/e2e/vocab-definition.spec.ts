/**
 * E2E: Vocabulary page — definition sheet open/close and content.
 */
import { test, expect } from "./base";
import { mockBackend } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test("clicking a lemma button opens the definition sheet", async ({ page }) => {
  await page.goto("/vocabulary");

  // Wait for vocab list to render (lemma "universal" from mock fixture)
  await expect(page.getByRole("button", { name: "universal", exact: true })).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "universal", exact: true }).click();

  // Slide-up sheet appears with the word title
  await expect(page.locator(".animate-slide-up")).toBeVisible();
  await expect(page.locator(".animate-slide-up").getByText("universal")).toBeVisible();
});

test("definition sheet shows part-of-speech, definition text, and Wiktionary link", async ({ page }) => {
  await page.goto("/vocabulary");
  await expect(page.getByRole("button", { name: "universal", exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "universal", exact: true }).click();

  // POS label and definition from fixture mock
  await expect(page.getByText("adjective")).toBeVisible();
  await expect(page.getByText("relating to or done by all")).toBeVisible();

  // Wiktionary link
  await expect(page.getByRole("link", { name: /View on Wiktionary/ })).toBeVisible();
});

test("Escape key closes the definition sheet", async ({ page }) => {
  await page.goto("/vocabulary");
  await expect(page.getByRole("button", { name: "universal", exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "universal", exact: true }).click();
  await expect(page.locator(".animate-slide-up")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.locator(".animate-slide-up")).not.toBeVisible();
});

test("clicking the backdrop closes the definition sheet", async ({ page }) => {
  await page.goto("/vocabulary");
  await expect(page.getByRole("button", { name: "universal", exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "universal", exact: true }).click();
  await expect(page.locator(".animate-slide-up")).toBeVisible();

  // Click at the top of the screen, well away from the bottom sheet
  await page.mouse.click(200, 80);

  await expect(page.locator(".animate-slide-up")).not.toBeVisible();
});

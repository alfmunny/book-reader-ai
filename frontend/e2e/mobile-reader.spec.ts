/**
 * E2E: Mobile reader — bottom bar and layout
 *
 * Verifies mobile-specific UI (bottom bar controls, header simplification)
 * using a 390×844 viewport (iPhone 13).
 */
import { test, expect, Page } from "./base";
import { mockBackend, MOCK_CHAPTERS } from "./fixtures";

async function setupMobile(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBackend(page);
  await page.route("**/api/annotations/*", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/user/reading-progress", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/books/*/chapters/*/translation", (r) =>
    r.fulfill({ json: { status: "ready", paragraphs: ["Translated."], provider: "gemini" } })
  );
}

test.describe("Mobile reader bottom bar", () => {
  test.beforeEach(async ({ page }) => {
    await setupMobile(page);
    await page.goto("/reader/1342");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test("does not show prev/next chapter arrow buttons", async ({ page }) => {
    await expect(page.getByLabel("Previous chapter")).not.toBeVisible();
    await expect(page.getByLabel("Next chapter")).not.toBeVisible();
  });

  // The mobile bottom bar's chapter <select> became a Contents button that
  // opens the sidebar panel as a sheet (#2745).
  async function pickChapter(page: import("@playwright/test").Page, name: string) {
    const mobileBar = page.locator(".md\\:hidden").last();
    await mobileBar.getByRole("button", { name: "Table of contents" }).click();
    const toc = page.getByRole("navigation", { name: /table of contents/i });
    await toc.getByRole("button", { name }).click();
  }

  test("the contents panel navigates to chapter 2", async ({ page }) => {
    await pickChapter(page, "2. Chapter II");
    await expect(page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });
  });

  test("the contents panel returns to chapter 1 from chapter 2", async ({ page }) => {
    await pickChapter(page, "2. Chapter II");
    await expect(page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });

    await pickChapter(page, "1. Chapter I");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });
  });

  test("translation button toggles on with single tap and off with second tap", async ({ page }) => {
    const translateBtn = page.getByRole("button", { name: "Translation" });
    await translateBtn.click();
    // Options panel (Inline / Side by side) should appear
    await expect(page.getByText("Inline")).toBeVisible({ timeout: 3000 });

    // Second tap turns translation off
    await translateBtn.click();
    await expect(page.getByText("Inline")).not.toBeVisible();
  });
});

test.describe("Desktop reader unchanged", () => {
  test("desktop header shows Translate button and contents control", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockBackend(page);
    await page.route("**/api/annotations/*", (r) => r.fulfill({ json: [] }));
    await page.route("**/api/user/reading-progress", (r) => r.fulfill({ json: [] }));

    await page.goto("/reader/1342");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });

    // Header has the contents control and Translate
    await expect(
      page.locator("header").getByRole("button", { name: "Table of contents" })
    ).toBeVisible();
    await expect(page.locator("header").getByText("Translate")).toBeVisible();
  });
});

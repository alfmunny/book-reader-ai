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

  test("chapter dropdown navigates to chapter 2", async ({ page }) => {
    // The mobile bottom bar contains a select for chapter navigation
    const mobileBar = page.locator(".md\\:hidden").last();
    const select = mobileBar.locator("select");
    await select.selectOption("1");
    await expect(page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });
  });

  test("chapter dropdown returns to chapter 1 from chapter 2", async ({ page }) => {
    const mobileBar = page.locator(".md\\:hidden").last();
    const select = mobileBar.locator("select");
    await select.selectOption("1");
    await expect(page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });

    await select.selectOption("0");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });
  });

  test("translation button toggles on with single tap and off with second tap", async ({ page }) => {
    const translateBtn = page.getByLabel("Translation");
    await translateBtn.click();
    // Options panel (Inline / Side by side) should appear
    await expect(page.getByText("Inline")).toBeVisible({ timeout: 3000 });

    // Second tap turns translation off
    await translateBtn.click();
    await expect(page.getByText("Inline")).not.toBeVisible();
  });
});

test.describe("Desktop reader unchanged", () => {
  test("desktop header shows Translate button and chapter selector", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockBackend(page);
    await page.route("**/api/annotations/*", (r) => r.fulfill({ json: [] }));
    await page.route("**/api/user/reading-progress", (r) => r.fulfill({ json: [] }));

    await page.goto("/reader/1342");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });

    // Header has chapter select and Translate
    await expect(page.locator("header select").first()).toBeVisible();
    await expect(page.locator("header").getByText("Translate")).toBeVisible();
  });
});

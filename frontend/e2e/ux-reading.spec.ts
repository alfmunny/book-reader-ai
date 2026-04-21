/**
 * E2E: Reading UX — progress, navigation, font size, theme, keyboard shortcuts.
 *
 * These tests verify the core reader UX patterns expected by users of book reader
 * apps (Kindle, Apple Books, etc.): persistent progress indicators, smooth chapter
 * navigation, readable customisation, and keyboard accessibility.
 */
import { test, expect, Page } from "./base";
import { mockBackend, MOCK_CHAPTERS } from "./fixtures";

async function setupReader(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockBackend(page);
  await page.route("**/api/annotations/*", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/user/reading-progress", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/books/*/chapters/*/translation", (r) =>
    r.fulfill({ json: { status: "ready", paragraphs: ["Translated."], provider: "gemini" } })
  );
}

test.describe("Reading progress indicator", () => {
  test.beforeEach(async ({ page }) => {
    await setupReader(page);
    await page.goto("/reader/1342");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test("progress bar is always visible", async ({ page }) => {
    const bar = page.locator('[title*="% through book"]');
    await expect(bar).toBeVisible();
  });

  test("chapter counter shows 1 / 3 on first chapter", async ({ page }) => {
    // Full text is "1 / 3 · 33%" — match the chapter fraction part
    await expect(page.getByText("1 / 3", { exact: false })).toBeVisible();
  });

  test("chapter counter updates to 2 / 3 after navigating forward", async ({ page }) => {
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("2 / 3", { exact: false })).toBeVisible();
  });

  test("chapter counter updates to 3 / 3 at last chapter", async ({ page }) => {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(MOCK_CHAPTERS[2].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("3 / 3", { exact: false })).toBeVisible();
  });

  test("progress bar width increases when navigating to later chapters", async ({ page }) => {
    const innerBar = page.locator('[title*="% through book"] > div');
    const widthBefore = await innerBar.evaluate((el) =>
      parseFloat((el as HTMLElement).style.width)
    );

    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });

    const widthAfter = await innerBar.evaluate((el) =>
      parseFloat((el as HTMLElement).style.width)
    );
    expect(widthAfter).toBeGreaterThan(widthBefore);
  });
});

test.describe("Keyboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupReader(page);
    await page.goto("/reader/1342");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test("ArrowRight navigates to next chapter", async ({ page }) => {
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });
  });

  test("ArrowLeft navigates to previous chapter from chapter 2", async ({ page }) => {
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });
  });

  test("ArrowLeft does nothing on first chapter", async ({ page }) => {
    await page.keyboard.press("ArrowLeft");
    // Still on chapter 1
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible();
    await expect(page.getByText("1 / 3", { exact: false })).toBeVisible();
  });

  test("ArrowRight does nothing on last chapter", async ({ page }) => {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(MOCK_CHAPTERS[2].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("ArrowRight");
    // Still on chapter 3
    await expect(page.getByText("3 / 3", { exact: false })).toBeVisible();
  });
});

test.describe("Bottom-of-chapter navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupReader(page);
    await page.goto("/reader/1342");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test("bottom prev chapter link is present", async ({ page }) => {
    await expect(page.getByText("← Previous chapter")).toBeVisible();
  });

  test("bottom next chapter link is present", async ({ page }) => {
    await expect(page.getByText("Next chapter →")).toBeVisible();
  });

  test("bottom prev chapter is disabled on first chapter", async ({ page }) => {
    const prevBtn = page.getByText("← Previous chapter");
    await expect(prevBtn).toHaveAttribute("disabled", "");
  });

  test("bottom next chapter navigates forward", async ({ page }) => {
    await page.getByText("Next chapter →").click();
    await expect(page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });
  });

  test("bottom next chapter is disabled on last chapter", async ({ page }) => {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(MOCK_CHAPTERS[2].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });
    const nextBtn = page.getByText("Next chapter →");
    await expect(nextBtn).toHaveAttribute("disabled", "");
  });
});

test.describe("Display customisation (desktop)", () => {
  test.beforeEach(async ({ page }) => {
    await setupReader(page);
    await page.goto("/reader/1342");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test("font size button is visible in header", async ({ page }) => {
    const fontBtn = page.locator('button[title^="Font size:"]');
    await expect(fontBtn).toBeVisible();
  });

  test("font size button cycles through sizes on click", async ({ page }) => {
    const fontBtn = page.locator('button[title^="Font size:"]');
    // Default is "base" — clicking advances to "lg"
    await fontBtn.click();
    await expect(fontBtn).toHaveAttribute("title", "Font size: lg");
    await fontBtn.click();
    await expect(fontBtn).toHaveAttribute("title", "Font size: xl");
    await fontBtn.click();
    await expect(fontBtn).toHaveAttribute("title", "Font size: sm");
    await fontBtn.click();
    await expect(fontBtn).toHaveAttribute("title", "Font size: base");
  });

  test("theme button is visible in header", async ({ page }) => {
    const themeBtn = page.locator('button[title^="Theme:"]');
    await expect(themeBtn).toBeVisible();
  });

  test("theme button cycles through light → sepia → dark", async ({ page }) => {
    const themeBtn = page.locator('button[title^="Theme:"]');
    // Default is "light" → click to get "sepia"
    await themeBtn.click();
    await expect(themeBtn).toHaveAttribute("title", "Theme: sepia");
    const htmlTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    expect(htmlTheme).toBe("sepia");

    await themeBtn.click();
    await expect(themeBtn).toHaveAttribute("title", "Theme: dark");

    await themeBtn.click();
    await expect(themeBtn).toHaveAttribute("title", "Theme: light");
  });

  test("chapter title changes color in dark theme", async ({ page }) => {
    const themeBtn = page.locator('button[title^="Theme:"]');
    const heading = page.getByTestId("reader-chapter-heading").locator("h2");
    await expect(heading).toBeVisible();

    const lightColor = await heading.evaluate((el) => getComputedStyle(el).color);

    // Cycle to dark theme (light → sepia → dark)
    await themeBtn.click();
    await themeBtn.click();
    await expect(themeBtn).toHaveAttribute("title", "Theme: dark");

    const darkColor = await heading.evaluate((el) => getComputedStyle(el).color);
    expect(darkColor).not.toBe(lightColor);
  });

  test("font size change persists across chapter navigation", async ({ page }) => {
    const fontBtn = page.locator('button[title^="Font size:"]');
    await fontBtn.click(); // base → lg
    await expect(fontBtn).toHaveAttribute("title", "Font size: lg");

    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });
    // Font size should still be "lg" after navigation
    await expect(fontBtn).toHaveAttribute("title", "Font size: lg");
  });

  test("desktop header shows chapter selector dropdown", async ({ page }) => {
    await expect(page.locator("header select").first()).toBeVisible();
  });

  test("chapter selector dropdown lets user jump directly to a chapter", async ({ page }) => {
    const select = page.locator("header select").first();
    await select.selectOption({ index: 2 }); // chapter III
    await expect(page.getByText(MOCK_CHAPTERS[2].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Back to library navigation", () => {
  test("← Library link navigates to home", async ({ page }) => {
    await setupReader(page);
    await page.goto("/reader/1342");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });

    await page.locator("header").getByText("Library").click();
    await expect(page).toHaveURL("/");
  });
});

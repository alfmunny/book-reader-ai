/**
 * E2E: Mobile reader interactions
 *
 * Tests the mobile-specific UX: bottom bar controls, chapter navigation,
 * translation panel, and desktop/mobile layout differences.
 *
 * Note: gesture-based interactions (tap zones, long-press, swipe) are
 * hard to simulate reliably in headless Playwright and are better verified
 * with manual testing or a real device lab. This file focuses on the
 * UI elements and state changes that Playwright handles well.
 */
import { test, expect, Page } from "@playwright/test";
import { mockBackend, MOCK_CHAPTERS } from "./fixtures";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function mockMobileReader(page: Page) {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await mockBackend(page);

  await page.route("**/api/books/*/chapters/*/translation", (route) =>
    route.fulfill({
      json: {
        status: "ready",
        paragraphs: ["[translated paragraph]"],
        provider: "gemini",
        model: "gemini-2.5-flash",
      },
    })
  );

  await page.route("**/api/annotations/*", (route) =>
    route.fulfill({ json: [] })
  );

  await page.route("**/api/vocabulary", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({ json: { ok: true } });
    } else {
      route.fulfill({ json: [] });
    }
  });

  await page.route("**/api/user/reading-progress", (route) =>
    route.fulfill({ json: [] })
  );
}

async function openReader(page: Page) {
  await page.goto("/reader/1342");
  await expect(
    page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })
  ).toBeVisible({ timeout: 10000 });
}

// ── Mobile Bottom Bar ───────────────────────────────────────────────────

test.describe("Mobile bottom bar", () => {
  test.beforeEach(async ({ page }) => {
    await mockMobileReader(page);
  });

  test("bottom bar is visible on mobile with all controls", async ({ page }) => {
    await openReader(page);

    await expect(page.getByRole("button", { name: "Previous chapter" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next chapter" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Read aloud|Pause/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Insight/ })).toBeVisible();
    await expect(page.getByText("🌐")).toBeVisible();
  });

  test("next button navigates to chapter 2", async ({ page }) => {
    await openReader(page);

    await page.getByRole("button", { name: "Next chapter" }).click();

    await expect(
      page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })
    ).toBeVisible({ timeout: 3000 });
  });

  test("prev button navigates back to chapter 1", async ({ page }) => {
    await openReader(page);

    // Go to chapter 2 first
    await page.getByRole("button", { name: "Next chapter" }).click();
    await expect(
      page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })
    ).toBeVisible({ timeout: 3000 });

    // Go back
    await page.getByRole("button", { name: "Previous chapter" }).click();
    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })
    ).toBeVisible({ timeout: 3000 });
  });

  test("prev button is disabled on first chapter", async ({ page }) => {
    await openReader(page);
    await expect(page.getByRole("button", { name: "Previous chapter" })).toBeDisabled();
  });

  test("chapter dropdown navigates to selected chapter", async ({ page }) => {
    await openReader(page);

    // The bottom bar has a select for chapter navigation
    const selects = page.locator("select");
    const lastSelect = selects.last();
    await lastSelect.selectOption({ index: 2 }); // Chapter 3

    await expect(
      page.getByText(MOCK_CHAPTERS[2].text.slice(0, 20), { exact: false })
    ).toBeVisible({ timeout: 3000 });
  });

  test("translate button enables translation and shows options panel", async ({ page }) => {
    await openReader(page);

    await page.getByText("🌐").click();
    await page.waitForTimeout(300);

    // Options panel should appear with Inline / Side by side toggle
    await expect(page.getByRole("button", { name: "Inline" })).toBeVisible({ timeout: 2000 });
    await expect(page.getByRole("button", { name: "Side by side" })).toBeVisible();
  });

  test("insight button opens sidebar overlay on mobile", async ({ page }) => {
    await openReader(page);

    await page.getByRole("button", { name: "Insight" }).click();
    await page.waitForTimeout(300);

    // Sidebar should be visible (fullscreen overlay on mobile)
    // The mobile close button should also appear
    await expect(page.getByText("Insight Chat")).toBeVisible({ timeout: 2000 });
  });
});

// ── Mobile Header ───────────────────────────────────────────────────────

test.describe("Mobile header is minimal", () => {
  test.beforeEach(async ({ page }) => {
    await mockMobileReader(page);
  });

  test("header does not show chapter nav controls on mobile", async ({ page }) => {
    await openReader(page);

    // The header's chapter nav (< select >) should be hidden on mobile
    const headerChapterNav = page.locator("header .hidden.md\\:flex select");
    await expect(headerChapterNav).not.toBeVisible();
  });

  test("header shows back button and book title", async ({ page }) => {
    await openReader(page);

    const header = page.locator("header");
    await expect(header.getByText("Pride and Prejudice")).toBeVisible();
    // Back button (← or "Library")
    await expect(header.getByText("←")).toBeVisible();
  });

  test("translation toolbar (Row 2) is hidden on mobile", async ({ page }) => {
    await openReader(page);

    // The desktop translation toolbar uses "hidden md:flex"
    const translateRow = page.locator("header .hidden.md\\:flex").filter({ hasText: "Translate" });
    // Should not be visible on mobile viewport
    const count = await translateRow.count();
    if (count > 0) {
      await expect(translateRow.first()).not.toBeVisible();
    }
  });
});

// ── Desktop Layout Unaffected ───────────────────────────────────────────

test.describe("Desktop layout unaffected", () => {
  test("desktop shows full header with chapter nav and translate toolbar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockBackend(page);
    await page.route("**/api/annotations/*", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/user/reading-progress", (route) => route.fulfill({ json: [] }));

    await page.goto("/reader/1342");
    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })
    ).toBeVisible({ timeout: 10000 });

    // Desktop header should show chapter navigation select
    await expect(page.locator("header select").first()).toBeVisible();

    // Desktop should show the Translate button in the header
    await expect(page.locator("header").getByText("Translate")).toBeVisible();
  });

  test("desktop does not show mobile bottom bar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockBackend(page);
    await page.route("**/api/annotations/*", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/user/reading-progress", (route) => route.fulfill({ json: [] }));

    await page.goto("/reader/1342");
    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })
    ).toBeVisible({ timeout: 10000 });

    // The prev/next aria-label buttons from the mobile bottom bar should not be visible
    // (desktop has its own chapter nav in the header)
    const mobilePrev = page.locator("button[aria-label='Previous chapter']");
    const count = await mobilePrev.count();
    // If they exist in DOM, they should be hidden via md:hidden
    if (count > 0) {
      await expect(mobilePrev.first()).not.toBeVisible();
    }
  });
});

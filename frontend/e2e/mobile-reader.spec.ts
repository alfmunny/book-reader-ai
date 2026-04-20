/**
 * E2E: Mobile reader interactions
 *
 * Tests the mobile-specific UX: immersive mode, bottom bar, tap zones,
 * long-press word action drawer, and translation controls.
 *
 * Uses iPhone 13 viewport (390×844) to match a real mobile device.
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

// ── Immersive Mode ──────────────────────────────────────────────────────

test.describe("Immersive mode", () => {
  test.beforeEach(async ({ page }) => {
    await mockMobileReader(page);
  });

  test("header auto-hides after initial load", async ({ page }) => {
    await openReader(page);
    const header = page.locator("header").first();
    await expect(header).toBeVisible();

    // Wait for auto-hide (2.5s + generous CI buffer)
    await expect(header).toHaveCSS("opacity", "0", { timeout: 6000 });
  });

  test("tapping center of reading area toggles header visibility", async ({ page }) => {
    await openReader(page);
    const header = page.locator("header").first();

    // Wait for auto-hide
    await expect(header).toHaveCSS("opacity", "0", { timeout: 6000 });

    // Tap center — use page.mouse for reliability
    const box = await page.locator("#reader-scroll").boundingBox();
    if (!box) throw new Error("No reader scroll box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);

    // Header should reappear
    await expect(header).toHaveCSS("opacity", "1", { timeout: 2000 });
  });

  test("scrolling hides the header", async ({ page }) => {
    await openReader(page);
    const header = page.locator("header").first();

    // Make sure header is visible (tap to toggle if needed)
    await expect(header).toHaveCSS("opacity", "0", { timeout: 6000 });
    const box = await page.locator("#reader-scroll").boundingBox();
    if (!box) throw new Error("No reader scroll box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(header).toHaveCSS("opacity", "1", { timeout: 2000 });

    // Scroll down
    await page.evaluate(() => {
      document.getElementById("reader-scroll")?.scrollBy(0, 200);
    });

    // Header should hide again
    await expect(header).toHaveCSS("opacity", "0", { timeout: 3000 });
  });
});

// ── Tap Zones ───────────────────────────────────────────────────────────

test.describe("Tap zones for chapter navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockMobileReader(page);
  });

  test("tapping right edge navigates to next chapter", async ({ page }) => {
    await openReader(page);
    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })
    ).toBeVisible();

    // Tap right edge — use mouse.click at x=95% of viewport
    // y=600 is safely in the reading area, below any header
    await page.mouse.click(MOBILE_VIEWPORT.width - 15, 600);
    await page.waitForTimeout(500);

    await expect(
      page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })
    ).toBeVisible({ timeout: 3000 });
  });

  test("tapping left edge navigates to previous chapter", async ({ page }) => {
    await openReader(page);

    // First navigate to chapter 2 using the bottom bar
    const nextBtn = page.getByRole("button", { name: "Next chapter" });
    await nextBtn.click();
    await expect(
      page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })
    ).toBeVisible({ timeout: 3000 });

    // Tap left edge to go back
    await page.mouse.click(15, 600);
    await page.waitForTimeout(500);

    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })
    ).toBeVisible({ timeout: 3000 });
  });

  test("tapping left edge on first chapter does nothing", async ({ page }) => {
    await openReader(page);
    await page.mouse.click(15, 600);
    await page.waitForTimeout(500);

    // Still on chapter 1
    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })
    ).toBeVisible();
  });
});

// ── Bottom Bar ──────────────────────────────────────────────────────────

test.describe("Mobile bottom bar", () => {
  test.beforeEach(async ({ page }) => {
    await mockMobileReader(page);
  });

  test("bottom bar shows chapter dropdown and action buttons", async ({ page }) => {
    await openReader(page);

    // Chapter dropdown
    const selects = page.locator("select");
    // At least one select should be visible (the bottom bar chapter selector)
    const bottomSelect = selects.last();
    await expect(bottomSelect).toBeVisible();

    // Translate button (🌐)
    await expect(page.getByText("🌐")).toBeVisible();

    // TTS button
    await expect(page.getByRole("button", { name: /Read aloud|Pause/ })).toBeVisible();

    // Insight button
    await expect(page.getByRole("button", { name: /Insight/ })).toBeVisible();

    // Prev/next buttons
    await expect(page.getByRole("button", { name: "Previous chapter" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next chapter" })).toBeVisible();
  });

  test("chapter dropdown navigates to selected chapter", async ({ page }) => {
    await openReader(page);

    // Select chapter 2 from the last select (bottom bar)
    const selects = page.locator("select");
    await selects.last().selectOption({ index: 1 });
    await page.waitForTimeout(500);

    await expect(
      page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })
    ).toBeVisible({ timeout: 3000 });
  });

  test("prev/next buttons navigate chapters", async ({ page }) => {
    await openReader(page);

    // Click next (›)
    await page.getByRole("button", { name: "Next chapter" }).click();
    await expect(
      page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })
    ).toBeVisible({ timeout: 3000 });

    // Click prev (‹)
    await page.getByRole("button", { name: "Previous chapter" }).click();
    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })
    ).toBeVisible({ timeout: 3000 });
  });

  test("translate button enables translation and expands options", async ({ page }) => {
    await openReader(page);

    // Tap the 🌐 button
    await page.getByText("🌐").click();
    await page.waitForTimeout(300);

    // Options panel should expand with language selector and mode toggle
    await expect(page.getByText("Inline")).toBeVisible({ timeout: 2000 });
    await expect(page.getByText("Side by side")).toBeVisible();
  });
});

// ── Long Press → Word Action Drawer ─────────────────────────────────────

test.describe("Long press word action drawer", () => {
  test.beforeEach(async ({ page }) => {
    await mockMobileReader(page);
  });

  test("long pressing a word opens the action drawer", async ({ page }) => {
    await openReader(page);

    // Find a text segment and long-press it
    const segment = page.locator("[data-seg]").first();
    await expect(segment).toBeVisible();
    const box = await segment.boundingBox();
    if (!box) throw new Error("No segment bounding box");

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Use mouse to simulate long press: down → wait 600ms → up
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.waitForTimeout(500);

    // The word action drawer should be visible
    await expect(page.locator(".animate-slide-up")).toBeVisible({ timeout: 2000 });

    // Should have a "Read" action button
    await expect(
      page.locator(".animate-slide-up").getByRole("button", { name: /Read/ })
    ).toBeVisible();
  });

  test("drawer closes when tapping backdrop", async ({ page }) => {
    await openReader(page);

    // Open drawer via long press
    const segment = page.locator("[data-seg]").first();
    const box = await segment.boundingBox();
    if (!box) throw new Error("No segment bounding box");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.waitForTimeout(500);

    await expect(page.locator(".animate-slide-up")).toBeVisible({ timeout: 2000 });

    // Click backdrop (the semi-transparent overlay)
    const backdrop = page.locator(".bg-black\\/10");
    if (await backdrop.isVisible()) {
      await backdrop.click({ force: true });
    } else {
      // Press Escape as fallback
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(400);

    await expect(page.locator(".animate-slide-up")).not.toBeVisible();
  });
});

// ── Desktop Unaffected ──────────────────────────────────────────────────

test.describe("Desktop layout unaffected", () => {
  test("desktop shows full header with all controls, no mobile bottom bar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockBackend(page);
    await page.route("**/api/annotations/*", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/user/reading-progress", (route) => route.fulfill({ json: [] }));

    await page.goto("/reader/1342");
    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })
    ).toBeVisible({ timeout: 10000 });

    // Desktop header should show chapter navigation
    const headerSelect = page.locator("header select").first();
    await expect(headerSelect).toBeVisible();

    // Desktop should show the Translate button in the header
    await expect(page.locator("header").getByText("Translate")).toBeVisible();

    // Mobile-only bottom bar should NOT be visible on desktop
    const bottomBars = page.locator("[aria-label='Previous chapter']");
    // On desktop, the bottom bar is hidden via md:hidden
    // Check that the safe-bottom container is not rendered or is hidden
    const mobileBar = page.locator(".safe-bottom");
    const count = await mobileBar.count();
    if (count > 0) {
      await expect(mobileBar.first()).not.toBeVisible();
    }
  });
});

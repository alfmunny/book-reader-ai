/**
 * E2E: Mobile reader interactions
 *
 * Tests the mobile-specific UX: immersive mode, bottom bar, tap zones,
 * swipe gestures, long-press word action drawer, and translation controls.
 *
 * Uses iPhone 13 viewport (390×844) to match a real mobile device.
 */
import { test, expect, Page } from "@playwright/test";
import { mockBackend, MOCK_CHAPTERS } from "./fixtures";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function mockMobileReader(page: Page) {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await mockBackend(page);

  // Mock translation endpoint for translate tests
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

  // Mock annotations endpoint
  await page.route("**/api/annotations/*", (route) =>
    route.fulfill({ json: [] })
  );

  // Mock vocabulary save
  await page.route("**/api/vocabulary", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({ json: { ok: true } });
    } else {
      route.fulfill({ json: [] });
    }
  });

  // Mock reading progress
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
    // Header visible initially
    const header = page.locator("header").first();
    await expect(header).toBeVisible();

    // Wait for auto-hide (2.5s + buffer)
    await page.waitForTimeout(3500);
    await expect(header).toHaveCSS("opacity", "0");
  });

  test("tapping center of reading area toggles header visibility", async ({ page }) => {
    await openReader(page);
    await page.waitForTimeout(3500); // wait for auto-hide

    // Header should be hidden
    const header = page.locator("header").first();
    await expect(header).toHaveCSS("opacity", "0");

    // Tap center of reading area (not on text)
    await page.click("#reader-scroll", {
      position: { x: MOBILE_VIEWPORT.width / 2, y: 300 },
      force: true,
    });
    await page.waitForTimeout(500);

    // Header should be visible
    await expect(header).toHaveCSS("opacity", "1");
  });

  test("scrolling hides the header", async ({ page }) => {
    await openReader(page);
    // Make header visible
    await page.click("#reader-scroll", {
      position: { x: MOBILE_VIEWPORT.width / 2, y: 300 },
      force: true,
    });
    await page.waitForTimeout(500);
    const header = page.locator("header").first();
    await expect(header).toHaveCSS("opacity", "1");

    // Scroll down
    await page.evaluate(() => {
      document.getElementById("reader-scroll")?.scrollBy(0, 200);
    });
    await page.waitForTimeout(500);

    // Header should be hidden
    await expect(header).toHaveCSS("opacity", "0");
  });
});

// ── Tap Zones ───────────────────────────────────────────────────────────

test.describe("Tap zones for chapter navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockMobileReader(page);
  });

  test("tapping right 20% of screen navigates to next chapter", async ({ page }) => {
    await openReader(page);
    // Verify chapter 1 content
    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })
    ).toBeVisible();

    // Tap right edge (x = 95% of width)
    const x = Math.floor(MOBILE_VIEWPORT.width * 0.95);
    await page.click("#reader-scroll", { position: { x, y: 300 }, force: true });
    await page.waitForTimeout(500);

    // Should show chapter 2 content
    await expect(
      page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })
    ).toBeVisible();
  });

  test("tapping left 20% navigates to previous chapter", async ({ page }) => {
    await openReader(page);

    // First go to chapter 2 via right-edge tap
    const xRight = Math.floor(MOBILE_VIEWPORT.width * 0.95);
    await page.click("#reader-scroll", { position: { x: xRight, y: 300 }, force: true });
    await page.waitForTimeout(500);
    await expect(
      page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })
    ).toBeVisible();

    // Now tap left edge to go back to chapter 1
    const xLeft = Math.floor(MOBILE_VIEWPORT.width * 0.05);
    await page.click("#reader-scroll", { position: { x: xLeft, y: 300 }, force: true });
    await page.waitForTimeout(500);

    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })
    ).toBeVisible();
  });

  test("tapping left edge on first chapter does nothing", async ({ page }) => {
    await openReader(page);
    const xLeft = Math.floor(MOBILE_VIEWPORT.width * 0.05);
    await page.click("#reader-scroll", { position: { x: xLeft, y: 300 }, force: true });
    await page.waitForTimeout(500);

    // Still on chapter 1
    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })
    ).toBeVisible();
  });
});

// ── Swipe Gestures ──────────────────────────────────────────────────────

test.describe("Swipe gesture chapter navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockMobileReader(page);
  });

  test("swiping left navigates to next chapter", async ({ page }) => {
    await openReader(page);

    // Simulate swipe left (finger moves from right to left = next chapter)
    const scrollArea = page.locator("#reader-scroll");
    const box = await scrollArea.boundingBox();
    if (!box) throw new Error("No bounding box");

    const startX = box.x + box.width * 0.8;
    const endX = box.x + box.width * 0.2;
    const y = box.y + box.height / 2;

    await page.touchscreen.tap(startX, y);
    // Use mouse-based drag to simulate the swipe since Playwright's
    // touchscreen API doesn't have a direct swipe method
    await page.dispatchEvent("#reader-scroll", "touchstart", {
      touches: [{ clientX: startX, clientY: y, identifier: 0 }],
      changedTouches: [{ clientX: startX, clientY: y, identifier: 0 }],
    });
    await page.waitForTimeout(50);
    await page.dispatchEvent("#reader-scroll", "touchend", {
      touches: [],
      changedTouches: [{ clientX: endX, clientY: y, identifier: 0 }],
    });
    await page.waitForTimeout(500);

    await expect(
      page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })
    ).toBeVisible();
  });
});

// ── Bottom Bar ──────────────────────────────────────────────────────────

test.describe("Mobile bottom bar", () => {
  test.beforeEach(async ({ page }) => {
    await mockMobileReader(page);
  });

  test("bottom bar has chapter dropdown, translate, TTS, and insight buttons", async ({ page }) => {
    await openReader(page);

    // Chapter dropdown should be visible in the bottom bar
    const bottomBar = page.locator(".safe-bottom").last();
    await expect(bottomBar.locator("select")).toBeVisible();

    // Translate, TTS, and insight buttons
    await expect(bottomBar.getByText("🌐")).toBeVisible();
    await expect(bottomBar.getByRole("button", { name: /Read aloud|Pause/ })).toBeVisible();
    await expect(bottomBar.getByRole("button", { name: /Insight/ })).toBeVisible();
  });

  test("chapter dropdown navigates to selected chapter", async ({ page }) => {
    await openReader(page);

    const bottomSelect = page.locator(".safe-bottom select").last();
    await bottomSelect.selectOption({ index: 1 }); // Chapter 2
    await page.waitForTimeout(500);

    await expect(
      page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })
    ).toBeVisible();
  });

  test("prev/next buttons in bottom bar navigate chapters", async ({ page }) => {
    await openReader(page);

    // Click next (›)
    const nextBtn = page.getByRole("button", { name: "Next chapter" });
    await nextBtn.click();
    await page.waitForTimeout(500);

    await expect(
      page.getByText(MOCK_CHAPTERS[1].text.slice(0, 20), { exact: false })
    ).toBeVisible();

    // Click prev (‹)
    const prevBtn = page.getByRole("button", { name: "Previous chapter" });
    await prevBtn.click();
    await page.waitForTimeout(500);

    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })
    ).toBeVisible();
  });

  test("translate button expands options panel on tap", async ({ page }) => {
    await openReader(page);

    // Mock the translation endpoint
    await page.route("**/api/books/*/chapters/*/translation", (route) =>
      route.fulfill({
        json: { status: "ready", paragraphs: ["Translated!"], provider: "gemini" },
      })
    );

    // Tap the 🌐 button
    const translateBtn = page.locator(".safe-bottom").last().getByText("🌐");
    await translateBtn.click();
    await page.waitForTimeout(300);

    // Options panel should expand with language selector and mode toggle
    await expect(page.locator(".safe-bottom select").first()).toBeVisible();
    await expect(page.getByText("Inline")).toBeVisible();
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

    // Find a text segment
    const segment = page.locator("[data-seg]").first();
    await expect(segment).toBeVisible();

    const box = await segment.boundingBox();
    if (!box) throw new Error("No segment bounding box");

    // Simulate long press: pointerdown → wait 600ms → pointerup
    await page.dispatchEvent("[data-seg]", "pointerdown", {
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
      pointerId: 1,
      pointerType: "touch",
    });
    await page.waitForTimeout(600);
    await page.dispatchEvent("[data-seg]", "pointerup", {
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
      pointerId: 1,
      pointerType: "touch",
    });
    await page.waitForTimeout(500);

    // The word action drawer should be visible
    const drawer = page.locator(".animate-slide-up");
    await expect(drawer).toBeVisible();

    // Should have action buttons
    await expect(page.getByRole("button", { name: /Read/ })).toBeVisible();
  });

  test("drawer closes when tapping backdrop", async ({ page }) => {
    await openReader(page);

    // Open drawer via long press
    const segment = page.locator("[data-seg]").first();
    const box = await segment.boundingBox();
    if (!box) throw new Error("No segment bounding box");

    await page.dispatchEvent("[data-seg]", "pointerdown", {
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
      pointerId: 1,
      pointerType: "touch",
    });
    await page.waitForTimeout(600);
    await page.dispatchEvent("[data-seg]", "pointerup", {
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
      pointerId: 1,
      pointerType: "touch",
    });
    await page.waitForTimeout(500);

    const drawer = page.locator(".animate-slide-up");
    await expect(drawer).toBeVisible();

    // Click backdrop to close
    await page.locator(".bg-black\\/10").click();
    await page.waitForTimeout(300);

    await expect(drawer).not.toBeVisible();
  });
});

// ── Desktop Unaffected ──────────────────────────────────────────────────

test.describe("Desktop layout unaffected", () => {
  test("desktop shows full header with all controls", async ({ page }) => {
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

    // Mobile bottom bar should NOT be visible
    await expect(page.locator(".safe-bottom")).not.toBeVisible();
  });
});

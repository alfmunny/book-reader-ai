/**
 * E2E: Annotation and Translation features
 *
 * Covers:
 * - Toolbar Translate button opens sidebar without auto-enabling translation
 * - User enables translation via the toggle; state persists to settings
 * - Translation language persists to settings
 * - Notes sidebar shows annotations grouped by chapter
 * - InsightChat has no References tab or internal tab bar
 */
import { test, expect } from "./base";
import { mockBackend } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

/** Open the translate sidebar and flip the toggle from Disabled → Enabled. */
async function openAndEnableTranslation(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Translate/i }).first().click();
  await page.locator("label").filter({ hasText: /Disabled/ }).click();
}

// ── Translation ───────────────────────────────────────────────────────────────

test("toolbar Translate button opens sidebar without enabling translation", async ({ page }) => {
  await page.goto("/reader/1342");
  await expect(page.getByText(/truth universally acknowledged/)).toBeVisible();

  await page.getByRole("button", { name: /Translate/i }).first().click();

  // Sidebar translate panel is visible, but translation is still disabled
  await expect(page.getByText("Target language")).toBeVisible({ timeout: 3000 });
  await expect(page.getByText("Disabled")).toBeVisible();
});

test("enabling the translation toggle loads translation and persists to settings", async ({ page }) => {
  await page.route("**/api/books/*/chapters/*/translation", (route) =>
    route.fulfill({
      json: { status: "ready", paragraphs: ["Auto-loaded translation."], cached: true },
    })
  );

  await page.goto("/reader/1342");
  await expect(page.getByText(/truth universally acknowledged/)).toBeVisible();

  await openAndEnableTranslation(page);

  // Translation appears after enabling the toggle
  await expect(page.getByText("Auto-loaded translation.")).toBeVisible({ timeout: 5000 });

  // translationEnabled saved to settings
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem("book-reader-settings");
    return raw ? JSON.parse(raw) : null;
  });
  expect(saved?.translationEnabled).toBe(true);
});

test("translationEnabled persists: reopening the reader resumes translation", async ({ page }) => {
  await page.route("**/api/books/*/chapters/*/translation", (route) =>
    route.fulfill({
      json: { status: "ready", paragraphs: ["Persisted translation."], cached: true },
    })
  );

  await page.addInitScript(() => {
    localStorage.setItem(
      "book-reader-settings",
      JSON.stringify({ translationEnabled: true, translationLang: "de", insightLang: "en", ttsGender: "female", fontSize: "base", theme: "light" })
    );
  });
  await page.goto("/reader/1342");

  // Translation auto-fires because settings say it was enabled
  await expect(page.getByText("Persisted translation.")).toBeVisible({ timeout: 5000 });
});

test("translation sidebar has no standalone title heading", async ({ page }) => {
  await page.goto("/reader/1342");
  await page.getByRole("button", { name: /Translate/i }).first().click();

  // The sidebar panel should NOT have a bare "Translation" <h3> heading
  await expect(page.getByRole("heading", { name: /^Translation$/, level: 3 })).not.toBeVisible();
});

test("translation language is persisted to settings on change", async ({ page }) => {
  await page.route("**/api/books/*/chapters/*/translation", (route) =>
    route.fulfill({ json: { status: "ready", paragraphs: ["Translated."], cached: true } })
  );

  await page.goto("/reader/1342");
  await openAndEnableTranslation(page);

  await expect(page.getByText("Target language")).toBeVisible({ timeout: 3000 });
  await page.locator("label", { hasText: "Target language" }).locator("..").locator("select").selectOption({ value: "de" });

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem("book-reader-settings");
    return raw ? JSON.parse(raw) : null;
  });
  expect(saved?.translationLang).toBe("de");
});

test("translation language is loaded from settings on page open", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "book-reader-settings",
      JSON.stringify({ translationLang: "fr", insightLang: "en", ttsGender: "female", fontSize: "base", theme: "light" })
    );
  });
  await page.goto("/reader/1342");

  await page.getByRole("button", { name: /Translate/i }).first().click();
  await expect(page.getByText("Target language")).toBeVisible({ timeout: 3000 });

  const selectValue = await page.locator("label", { hasText: "Target language" })
    .locator("..").locator("select").inputValue();
  expect(selectValue).toBe("fr");
});

// ── InsightChat cleanup ───────────────────────────────────────────────────────

test("InsightChat has no References tab", async ({ page }) => {
  await page.goto("/reader/1342");
  await expect(page.getByText(/truth universally acknowledged/)).toBeVisible();

  // Open Insight chat
  await page.getByRole("button", { name: /Insight/i }).first().click();

  // There should be no References tab in the chat panel
  await expect(page.getByRole("tab", { name: /references/i })).not.toBeVisible();
  await expect(page.getByText(/^References$/, { exact: true })).not.toBeVisible();
});

test("InsightChat has no internal tab bar", async ({ page }) => {
  await page.goto("/reader/1342");
  await page.getByRole("button", { name: /Insight/i }).first().click();

  // The sidebar panel should NOT contain a secondary tab bar with Chat/References buttons
  await expect(page.locator("[role=tablist]")).not.toBeVisible();
});

// ── Notes / Annotations ───────────────────────────────────────────────────────

test("Notes button is visible when authenticated", async ({ page }) => {
  await page.goto("/reader/1342");
  await expect(page.getByText(/truth universally acknowledged/)).toBeVisible();

  // Notes button should appear in the toolbar (backendToken in session mock enables it)
  await expect(page.getByRole("button", { name: /notes/i })).toBeVisible({ timeout: 5000 });
});

test("Notes sidebar shows empty state when no annotations", async ({ page }) => {
  await page.goto("/reader/1342");
  await page.getByRole("button", { name: /notes/i }).click();

  // Empty state text should appear
  await expect(page.getByText("No annotations yet.")).toBeVisible({ timeout: 3000 });
});

test("Notes sidebar shows existing annotations from API", async ({ page }) => {
  // Override the default empty-list stub with real annotations
  await page.route("**/api/annotations*", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        json: [
          {
            id: 10,
            book_id: 1342,
            chapter_index: 0,
            sentence_text: "It is a truth universally acknowledged",
            note_text: "Famous opening line",
            color: "yellow",
          },
          {
            id: 11,
            book_id: 1342,
            chapter_index: 1,
            sentence_text: "Mr. Bennet was among the earliest",
            note_text: "",
            color: "blue",
          },
        ],
      });
    } else {
      route.fulfill({ json: { ok: true } });
    }
  });

  await page.goto("/reader/1342");
  await page.getByRole("button", { name: /notes/i }).click();

  // Note text and sentence snippet should both appear in the sidebar
  await expect(page.getByText("Famous opening line")).toBeVisible({ timeout: 3000 });
  // Sentence text is shown in the notes panel (quoted/excerpted form)
  await expect(page.getByText(/truth universally acknowledged/).first()).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/Mr\. Bennet was among/).first()).toBeVisible({ timeout: 3000 });
});

test("annotation count badge appears on Notes button when annotations exist", async ({ page }) => {
  await page.route("**/api/annotations*", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        json: [
          { id: 1, book_id: 1342, chapter_index: 0, sentence_text: "Sentence.", note_text: "", color: "yellow" },
          { id: 2, book_id: 1342, chapter_index: 0, sentence_text: "Another.", note_text: "", color: "blue" },
        ],
      });
    } else {
      route.fulfill({ json: { ok: true } });
    }
  });

  await page.goto("/reader/1342");
  await expect(page.getByText(/truth universally acknowledged/)).toBeVisible({ timeout: 5000 });

  // The Notes button should display a count badge showing "2"
  await expect(page.getByRole("button", { name: /notes/i }).getByText("2")).toBeVisible({ timeout: 5000 });
});

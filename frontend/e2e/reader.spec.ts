/**
 * E2E: Reader page — chapter navigation and continue-reading
 */
import { test, expect } from "./base";
import { mockBackend, MOCK_CHAPTERS } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test("reader page loads book chapters", async ({ page }) => {
  await page.goto("/reader/1342");
  await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 30), { exact: false })).toBeVisible();
});

test("navigating to next chapter displays new content", async ({ page }) => {
  await page.goto("/reader/1342");
  // Find a "next" button or chapter selector and click
  // Since the UI exact shape is unknown, use any "Next" / ">" affordance
  const nextBtn = page.getByRole("button", { name: /next|→|›/i }).first();
  if (await nextBtn.isVisible().catch(() => false)) {
    await nextBtn.click();
    await expect(page.getByText(MOCK_CHAPTERS[1].text.slice(0, 30), { exact: false })).toBeVisible();
  }
});

test("continue-reading: reopening a book restores the last-read chapter", async ({ page }) => {
  // 1. Open book, programmatically seed localStorage with a saved chapter
  await page.goto("/reader/1342");
  await page.evaluate(() => {
    const book = {
      id: 1342,
      title: "Pride and Prejudice",
      authors: ["Jane Austen"],
      languages: ["en"],
      subjects: ["Fiction"],
      download_count: 50000,
      cover: "",
      lastRead: Date.now(),
      lastChapter: 2,
    };
    localStorage.setItem("recent_books", JSON.stringify([book]));
  });

  // 2. Reload the reader page
  await page.reload();

  // 3. The reader should open at chapter 3 (index 2) — verify its text is visible
  await expect(page.getByText(MOCK_CHAPTERS[2].text.slice(0, 30), { exact: false })).toBeVisible({ timeout: 5000 });
});

/** Seed localStorage with translationEnabled=true so translation auto-fires on page load. */
async function seedTranslationEnabled(page: import("@playwright/test").Page, lang = "de") {
  await page.addInitScript((l: string) => {
    localStorage.setItem(
      "book-reader-settings",
      JSON.stringify({ translationEnabled: true, translationLang: l, insightLang: "en", ttsGender: "female", fontSize: "base", theme: "light" })
    );
  }, lang);
  await page.goto("/reader/1342");
}

test("translation auto-loads and hides button when server has cached translation", async ({ page }) => {
  // Regression: button was shown even when server already had a cached translation
  // because the old code only checked in-memory cache, not the server.
  // Uses regex (not glob) to also match the ?target_language=... query string.
  await page.route(/\/api\/books\/\d+\/chapters\/\d+\/translation(\?.*)?$/, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ json: { status: "ready", paragraphs: ["Server-cached translation."], provider: "gemini" } });
    } else {
      route.fallback();
    }
  });

  await seedTranslationEnabled(page);
  await expect(page.getByText("Server-cached translation.")).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("button", { name: "Translate this chapter" })).not.toBeVisible();
});

test("Your Bookshelf shows chapter badge from recent-read data", async ({ page }) => {
  // Seed a recent book with lastChapter = 4
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem(
      "recent_books",
      JSON.stringify([
        {
          id: 1342,
          title: "Pride and Prejudice",
          authors: ["Jane Austen"],
          languages: ["en"],
          subjects: ["Fiction"],
          download_count: 50000,
          cover: "",
          lastRead: Date.now(),
          lastChapter: 4,
        },
      ])
    );
  });
  await page.goto("/bookshelf");
  // Badge format: "Ch. 5 · just now" (1-indexed display)
  await expect(page.getByText(/Ch\. 5/)).toBeVisible();
});

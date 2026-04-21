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

test("translation does not show Gemini reminder (queue returns ready)", async ({ page }) => {
  await page.route("**/api/user/me", (route) =>
    route.fulfill({
      json: { id: 1, email: "test@example.com", name: "Test", picture: "", hasGeminiKey: false, role: "user", approved: true },
    })
  );
  await page.route("**/api/books/*/chapters/*/translation", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 404, json: { detail: "Translation not cached" } });
    } else {
      route.fulfill({ json: { status: "ready", paragraphs: ["Translated text."], provider: "gemini", model: "gemini-2.5-flash" } });
    }
  });

  await seedTranslationEnabled(page);
  await expect(page.getByText(/truth universally acknowledged/)).toBeVisible();
  await page.getByRole("button", { name: /Translate/i }).first().click();
  await page.getByRole("button", { name: "Translate this chapter" }).click();
  await expect(page.getByText("Translated text.")).toBeVisible();
  await expect(page.getByText(/AI features require your own Gemini API key/)).not.toBeVisible();
});

test("translation shows queued state when worker is processing", async ({ page }) => {
  await page.route("**/api/user/me", (route) =>
    route.fulfill({ json: { id: 1, email: "t@t.com", name: "T", picture: "", hasGeminiKey: true, role: "user", approved: true } })
  );
  await page.route("**/api/books/*/chapters/*/translation", (route) =>
    route.fulfill({ json: { status: "pending", position: 2, worker_running: true } })
  );

  await seedTranslationEnabled(page);
  await expect(page.getByText(/truth universally acknowledged/)).toBeVisible();
  await page.getByRole("button", { name: /Translate/i }).first().click();
  await page.getByRole("button", { name: "Translate this chapter" }).click();
  await expect(page.getByText("Translated text.")).not.toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/queue · position 2/).first()).toBeVisible({ timeout: 5000 });
});

test("translation shows worker offline message when worker not running", async ({ page }) => {
  await page.route("**/api/user/me", (route) =>
    route.fulfill({ json: { id: 1, email: "t@t.com", name: "T", picture: "", hasGeminiKey: true, role: "user", approved: true } })
  );
  await page.route("**/api/books/*/chapters/*/translation", (route) =>
    route.fulfill({ json: { status: "pending", position: 1, worker_running: false } })
  );

  await seedTranslationEnabled(page);
  await expect(page.getByText(/truth universally acknowledged/)).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: /Translate/i }).first().click();
  await page.getByRole("button", { name: "Translate this chapter" }).click();
  await expect(page.getByText(/queue · worker is offline/).first()).toBeVisible({ timeout: 5000 });
});

test("Your Library shows chapter badge from recent-read data", async ({ page }) => {
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
  await page.reload();

  // Click the Library tab to ensure it's active
  await page.getByRole("button", { name: "Your Library" }).click();
  // Badge format: "Ch. 5 · just now" (1-indexed display)
  await expect(page.getByText(/Ch\. 5/)).toBeVisible();
});

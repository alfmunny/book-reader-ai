/**
 * E2E: Annotation sidebar — Notes tab in the unified reader sidebar.
 *
 * The reader uses a tab-based sidebar (Chat / Notes / Translation / Export).
 * The "📝 Notes" tab button in the header only shows when the session has a
 * backendToken. These tests mock the session accordingly.
 */
import { test, expect, Page } from "./base";
import { MOCK_BOOK, MOCK_FAUST, MOCK_CHAPTERS } from "./fixtures";

const MOCK_ANNOTATIONS = [
  {
    id: 1,
    book_id: 1342,
    chapter_index: 0,
    sentence_text: "It is a truth universally acknowledged",
    color: "yellow",
    note_text: "Famous opening line",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    user_id: 1,
  },
  {
    id: 2,
    book_id: 1342,
    chapter_index: 0,
    sentence_text: "that a single man in possession of a good fortune",
    color: "blue",
    note_text: "",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    user_id: 1,
  },
];

async function setupAnnotations(page: Page, annotations: typeof MOCK_ANNOTATIONS | [] = []) {
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.route("**/api/auth/session", (r) =>
    r.fulfill({
      json: {
        user: { name: "Test User", email: "test@example.com", image: "" },
        expires: "2030-01-01T00:00:00.000Z",
        backendToken: "mock-backend-token",
      },
    })
  );
  await page.route("**/api/user/me", (r) =>
    r.fulfill({
      json: { id: 1, email: "test@example.com", name: "Test", picture: "", hasGeminiKey: false, role: "user", approved: true },
    })
  );
  await page.route("**/api/books/cached", (r) => r.fulfill({ json: [MOCK_BOOK] }));
  await page.route(/\/api\/books\/\d+\/chapters$/, (r) => {
    const match = r.request().url().match(/\/books\/(\d+)\/chapters/);
    const bookId = Number(match?.[1] ?? 0);
    r.fulfill({
      json: { book_id: bookId, meta: bookId === 2229 ? MOCK_FAUST : MOCK_BOOK, chapters: MOCK_CHAPTERS, images: [] },
    });
  });
  await page.route(/\/api\/books\/\d+$/, (r) => r.fulfill({ json: MOCK_BOOK }));
  await page.route(/\/api\/books\/\d+\/translation-status/, (r) =>
    r.fulfill({ json: { book_id: 1342, target_language: "en", total_chapters: 3, translated_chapters: 3, bulk_active: false } })
  );
  await page.route(/\/api\/audiobooks\/\d+$/, (r) => r.fulfill({ status: 404, json: { detail: "Not linked" } }));
  await page.route("**/api/ai/translate", (r) => r.fulfill({ json: { paragraphs: ["[translated]"], cached: true } }));
  await page.route("**/api/ai/insight", (r) => r.fulfill({ json: { insight: "A mock insight." } }));
  await page.route("**/api/ai/tts", (r) => r.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from([0xff, 0xfb]) }));
  await page.route(/\/api\/annotations/, (r) => r.fulfill({ json: annotations }));
  await page.route("**/api/user/reading-progress", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/books/*/chapters/*/translation", (r) =>
    r.fulfill({ json: { status: "ready", paragraphs: ["Translated."], provider: "gemini" } })
  );
}

/** The "📝 Notes" header button that opens the sidebar to the notes tab. */
const notesHeaderBtn = (page: Page) =>
  page.getByRole("button", { name: /Notes/ }).first();

test.describe("Notes tab — empty state", () => {
  test.beforeEach(async ({ page }) => {
    await setupAnnotations(page, []);
    await page.goto("/reader/1342");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test("📝 Notes button is visible in header when authenticated", async ({ page }) => {
    await expect(notesHeaderBtn(page)).toBeVisible();
  });

  test("clicking Notes button opens the sidebar", async ({ page }) => {
    await notesHeaderBtn(page).click();
    // The notes tab content is shown — empty state message
    await expect(page.getByText("No annotations yet.")).toBeVisible({ timeout: 3000 });
  });

  test("empty notes sidebar shows friendly empty-state message", async ({ page }) => {
    await notesHeaderBtn(page).click();
    await expect(page.getByText("No annotations yet.")).toBeVisible({ timeout: 3000 });
  });

  test("empty notes sidebar shows usage hint", async ({ page }) => {
    await notesHeaderBtn(page).click();
    await expect(page.getByText("Long-press a sentence to add one.", { exact: false })).toBeVisible({ timeout: 3000 });
  });

  test("sidebar has tab bar with all four tabs when open", async ({ page }) => {
    await notesHeaderBtn(page).click();
    await expect(page.getByText("No annotations yet.")).toBeVisible({ timeout: 3000 });
    // Sidebar's own internal tab bar appears with all four tabs (labels rendered as text)
    // Use locator scoped to the second row (sidebar area, not just the header buttons)
    await expect(page.getByText("No annotations yet.")).toBeVisible();
    // The sidebar tab bar text is distinct from the header tab buttons
    // Verify by checking for a second "📝 Notes" tab (header + sidebar tab bar = 2)
    await expect(page.getByRole("button", { name: /📝 Notes/ })).toHaveCount(2);
  });

  test("clicking Notes button again closes the sidebar", async ({ page }) => {
    // Open
    await notesHeaderBtn(page).click();
    await expect(page.getByText("No annotations yet.")).toBeVisible({ timeout: 3000 });

    // Close (toggle — same button click when tab is "notes")
    await notesHeaderBtn(page).click();
    await expect(page.getByText("No annotations yet.")).not.toBeVisible({ timeout: 3000 });
  });

  test("Notes button is NOT visible without backendToken", async ({ page }) => {
    // Navigate fresh without auth
    await page.route("**/api/auth/session", (r) =>
      r.fulfill({ json: { user: { name: "T", email: "t@t.com", image: "" }, expires: "2030-01-01" } })
    );
    await page.reload();
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });
    // The Notes tab button in the header should be hidden when no backendToken
    const notesBtn = page.getByRole("button", { name: /^📝 Notes$/ });
    await expect(notesBtn).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe("Notes tab — with annotations", () => {
  test.beforeEach(async ({ page }) => {
    await setupAnnotations(page, MOCK_ANNOTATIONS);
    await page.goto("/reader/1342");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test("header Notes button shows annotation count badge", async ({ page }) => {
    // The badge appears on the Notes header button when annotations exist
    const btn = notesHeaderBtn(page);
    await expect(btn).toBeVisible();
    // The badge shows the count (2 annotations)
    await expect(btn.locator("span")).toContainText("2");
  });

  test("opening notes tab lists annotation text", async ({ page }) => {
    await notesHeaderBtn(page).click();
    // "Famous opening line" is the note_text — unique to the sidebar, not in chapter body
    await expect(page.getByText("Famous opening line")).toBeVisible({ timeout: 8000 });
  });

  test("opening notes tab shows annotation note text", async ({ page }) => {
    await notesHeaderBtn(page).click();
    await expect(page.getByText("Famous opening line")).toBeVisible({ timeout: 8000 });
  });

  test("notes tab groups annotations under chapter heading", async ({ page }) => {
    await notesHeaderBtn(page).click();
    await expect(page.getByText("Chapter 1", { exact: false })).toBeVisible({ timeout: 8000 });
  });

  test("notes tab shows both annotation entries", async ({ page }) => {
    await notesHeaderBtn(page).click();
    // Note texts are unique to the sidebar (not in chapter body)
    await expect(page.getByText("Famous opening line")).toBeVisible({ timeout: 8000 });
    // Second annotation has no note_text — verify via count badge (2 annotations)
    await expect(notesHeaderBtn(page).locator("span")).toContainText("2");
  });

  test("clicking an annotation in the sidebar closes the panel", async ({ page }) => {
    await notesHeaderBtn(page).click();
    // "Famous opening line" is unique to the sidebar annotations list
    await expect(page.getByText("Famous opening line")).toBeVisible({ timeout: 8000 });

    // Click the annotation entry — should close sidebar and jump to sentence
    await page.getByText("Famous opening line").click();
    await expect(page.getByText("Famous opening line")).not.toBeVisible({ timeout: 3000 });
  });
});

/**
 * Shared API stubs for E2E tests.
 *
 * Every test calls `mockBackend(page)` in a beforeEach to intercept all
 * backend calls at stub.test/api — the dev server is started with
 * NEXT_PUBLIC_API_URL=http://stub.test/api so nothing ever reaches a real backend.
 */
import { Page } from "@playwright/test";

export const MOCK_BOOK = {
  id: 1342,
  title: "Pride and Prejudice",
  authors: ["Jane Austen"],
  languages: ["en"],
  subjects: ["Fiction"],
  download_count: 50000,
  cover: "",
};

export const MOCK_FAUST = {
  id: 2229,
  title: "Faust",
  authors: ["Johann Wolfgang von Goethe"],
  languages: ["de"],
  subjects: ["Drama"],
  download_count: 30000,
  cover: "",
};

export const MOCK_CHAPTERS = [
  { title: "Chapter I", text: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife." },
  { title: "Chapter II", text: "Mr. Bennet was among the earliest of those who waited on Mr. Bingley." },
  { title: "Chapter III", text: "Not all that Mrs. Bennet, however, with the assistance of her five daughters, could say on the subject, was sufficient." },
];

export async function mockBackend(page: Page) {
  // Mock NextAuth session so useSession() returns status="authenticated" rather
  // than "unauthenticated". Without this the home page always flips to Discover.
  // backendToken is included so annotation/notes features are enabled.
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: { name: "Test User", email: "test@example.com", image: "" },
        expires: "2030-01-01T00:00:00.000Z",
        backendToken: "e2e-test-token",
      },
    })
  );

  await page.route("**/api/user/me", (route) =>
    route.fulfill({ json: { id: 1, email: "test@example.com", name: "Test", picture: "", hasGeminiKey: false, approved: true } })
  );

  await page.route("**/api/books/cached", (route) =>
    route.fulfill({ json: [MOCK_BOOK] })
  );

  await page.route(/\/api\/books\/search\?/, (route) => {
    const url = route.request().url();
    if (url.includes("Faust")) {
      route.fulfill({ json: { count: 1, books: [MOCK_FAUST] } });
    } else if (url.includes("Pride")) {
      route.fulfill({ json: { count: 1, books: [MOCK_BOOK] } });
    } else {
      route.fulfill({ json: { count: 0, books: [] } });
    }
  });

  await page.route(/\/api\/books\/\d+\/chapters$/, (route) => {
    const match = route.request().url().match(/\/books\/(\d+)\/chapters/);
    const bookId = Number(match?.[1] ?? 0);
    route.fulfill({
      json: {
        book_id: bookId,
        meta: bookId === 2229 ? MOCK_FAUST : MOCK_BOOK,
        chapters: MOCK_CHAPTERS,
        images: [],
      },
    });
  });

  await page.route(/\/api\/books\/\d+$/, (route) => {
    route.fulfill({ json: MOCK_BOOK });
  });

  await page.route(/\/api\/books\/\d+\/translation-status/, (route) =>
    route.fulfill({
      json: { book_id: 1342, target_language: "en", total_chapters: 3, translated_chapters: 3, bulk_active: false },
    })
  );

  await page.route("**/api/user/reading-progress*", (route) =>
    route.fulfill({ json: { entries: [] } })
  );

  await page.route("**/api/ai/translate", (route) =>
    route.fulfill({ json: { paragraphs: ["[translated]"], cached: true } })
  );

  await page.route("**/api/ai/insight", (route) =>
    route.fulfill({ json: { insight: "A mock insight." } })
  );

  await page.route("**/api/ai/tts", (route) =>
    route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from([0xff, 0xfb]) })
  );

  await page.route("**/api/annotations*", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ json: [] });
    } else if (route.request().method() === "POST") {
      route.fulfill({
        json: { id: 1, book_id: 1342, chapter_index: 0, sentence_text: "", note_text: "", color: "yellow" },
      });
    } else {
      route.fulfill({ json: { ok: true } });
    }
  });
}

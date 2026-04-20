/**
 * Tests for lib/api.ts — ApiError class, getAuthToken, awaitSession,
 * getPopularBooks, getChapterQueueStatus, requestChapterTranslation,
 * deleteTranslationCache, getReferences, and other uncovered paths.
 */

import {
  setAuthToken,
  getAuthToken,
  markSessionSettled,
  awaitSession,
  ApiError,
  getPopularBooks,
  getChapterQueueStatus,
  requestChapterTranslation,
  deleteTranslationCache,
  getReferences,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, ok = true, status = ok ? 200 : 400) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Bad Request",
    json: jest.fn().mockResolvedValue(body),
    blob: jest.fn().mockResolvedValue(new Blob([])),
    headers: { get: jest.fn().mockReturnValue(null) },
  });
}

function fetchUrl(): string {
  return (global.fetch as jest.Mock).mock.calls[0][0] as string;
}

function fetchMethod(): string {
  return (global.fetch as jest.Mock).mock.calls[0][1]?.method ?? "GET";
}

function fetchBody(): unknown {
  const raw = (global.fetch as jest.Mock).mock.calls[0][1]?.body;
  return raw ? JSON.parse(raw as string) : undefined;
}

beforeEach(() => {
  setAuthToken("test-token");
});

// ── ApiError class ─────────────────────────────────────────────────────────

test("ApiError stores status and message", () => {
  const err = new ApiError(404, "Not found");
  expect(err.status).toBe(404);
  expect(err.message).toBe("Not found");
  expect(err.name).toBe("ApiError");
});

test("ApiError is instanceof Error", () => {
  const err = new ApiError(500, "Server error");
  expect(err).toBeInstanceOf(Error);
  expect(err).toBeInstanceOf(ApiError);
});

test("ApiError with 401 status stores correct status", () => {
  const err = new ApiError(401, "Unauthorized");
  expect(err.status).toBe(401);
  expect(err.message).toBe("Unauthorized");
});

// ── getAuthToken ───────────────────────────────────────────────────────────

test("getAuthToken returns null when no token set", () => {
  setAuthToken(null);
  expect(getAuthToken()).toBeNull();
});

test("getAuthToken returns the current token", () => {
  setAuthToken("my-secret-jwt");
  expect(getAuthToken()).toBe("my-secret-jwt");
});

// ── awaitSession ───────────────────────────────────────────────────────────

test("awaitSession resolves immediately when session is already settled", async () => {
  // The jest.setup.js calls markSessionSettled(), so the module-level flag
  // is already true. awaitSession() should resolve without queuing.
  await expect(awaitSession()).resolves.toBeUndefined();
});

// ── getPopularBooks ───────────────────────────────────────────────────────

test("getPopularBooks calls /books/popular with page param", async () => {
  mockFetch({ books: [], total: 0, page: 1, per_page: 20 });
  const result = await getPopularBooks();
  expect(fetchUrl()).toContain("/books/popular");
  expect(fetchUrl()).toContain("page=1");
  expect(result.total).toBe(0);
});

test("getPopularBooks includes language param when provided", async () => {
  mockFetch({ books: [], total: 0, page: 1, per_page: 20 });
  await getPopularBooks("de", 2);
  expect(fetchUrl()).toContain("language=de");
  expect(fetchUrl()).toContain("page=2");
});

test("getPopularBooks omits language param when not provided", async () => {
  mockFetch({ books: [], total: 0, page: 1, per_page: 20 });
  await getPopularBooks("", 1);
  expect(fetchUrl()).not.toContain("language=");
});

// ── getChapterQueueStatus ─────────────────────────────────────────────────

test("getChapterQueueStatus calls the correct URL", async () => {
  mockFetch({ queued: true, status: "pending", position: 1, attempts: 0 });
  const result = await getChapterQueueStatus(42, 3, "zh");
  expect(fetchUrl()).toContain("/books/42/chapters/3/queue-status");
  expect(fetchUrl()).toContain("target_language=");
  expect(result.queued).toBe(true);
  expect(result.status).toBe("pending");
});

test("getChapterQueueStatus URL-encodes target language", async () => {
  mockFetch({ queued: false, status: null, position: null, attempts: 0 });
  await getChapterQueueStatus(1, 0, "zh-TW");
  expect(fetchUrl()).toContain(encodeURIComponent("zh-TW"));
});

// ── requestChapterTranslation ─────────────────────────────────────────────

test("requestChapterTranslation POSTs to the correct URL", async () => {
  mockFetch({ status: "ready", paragraphs: ["Hello", "World"], provider: "gemini" });
  const result = await requestChapterTranslation(5, 2, "en");
  expect(fetchUrl()).toContain("/books/5/chapters/2/translation");
  expect(fetchMethod()).toBe("POST");
  expect((fetchBody() as Record<string, unknown>).target_language).toBe("en");
  expect(result.status).toBe("ready");
});

test("requestChapterTranslation returns pending status", async () => {
  mockFetch({ status: "pending", position: 3, attempts: 1, worker_running: true });
  const result = await requestChapterTranslation(1, 0, "de");
  expect(result.status).toBe("pending");
  expect(result.position).toBe(3);
});

// ── deleteTranslationCache ─────────────────────────────────────────────────

test("deleteTranslationCache DELETEs the correct admin URL", async () => {
  mockFetch({ ok: true, deleted: 1 });
  const result = await deleteTranslationCache(10, 2, "zh");
  expect(fetchUrl()).toContain("/admin/translations/10/2/zh");
  expect(fetchMethod()).toBe("DELETE");
  expect(result.deleted).toBe(1);
});

test("deleteTranslationCache returns ok flag", async () => {
  mockFetch({ ok: true, deleted: 0 });
  const result = await deleteTranslationCache(1, 0, "en");
  expect(result.ok).toBe(true);
});

// ── getReferences ─────────────────────────────────────────────────────────

test("getReferences POSTs to /ai/references", async () => {
  mockFetch({ references: "Related: book1, book2" });
  const result = await getReferences("Faust", "Goethe", "Chapter 1", "excerpt text");
  expect(fetchUrl()).toContain("/ai/references");
  expect(fetchMethod()).toBe("POST");
  expect(result.references).toBe("Related: book1, book2");
});

test("getReferences sends correct body", async () => {
  mockFetch({ references: "" });
  await getReferences("Hamlet", "Shakespeare", "Act 1", "To be or not to be", "en");
  const body = fetchBody() as Record<string, unknown>;
  expect(body.book_title).toBe("Hamlet");
  expect(body.author).toBe("Shakespeare");
  expect(body.chapter_title).toBe("Act 1");
  expect(body.chapter_excerpt).toBe("To be or not to be");
  expect(body.response_language).toBe("en");
});

test("getReferences uses defaults for optional params", async () => {
  mockFetch({ references: "" });
  await getReferences("Hamlet", "Shakespeare");
  const body = fetchBody() as Record<string, unknown>;
  expect(body.chapter_title).toBe("");
  expect(body.chapter_excerpt).toBe("");
  expect(body.response_language).toBe("en");
});

// ── request with no auth token ────────────────────────────────────────────

test("request sends no Authorization header when token is null", async () => {
  setAuthToken(null);
  mockFetch({ books: [], total: 0, page: 1, per_page: 20 });
  await getPopularBooks();
  const headers = (global.fetch as jest.Mock).mock.calls[0][1]?.headers ?? {};
  expect(headers.Authorization).toBeUndefined();
});

// ── ApiError thrown by request ────────────────────────────────────────────

test("request throws ApiError with correct status on non-ok response", async () => {
  mockFetch({ detail: "Forbidden" }, false, 403);
  try {
    await getPopularBooks();
    fail("Expected an error to be thrown");
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).message).toBe("Forbidden");
  }
});

test("ApiError status is preserved in thrown error", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 422,
    statusText: "Unprocessable Entity",
    json: jest.fn().mockResolvedValue({ detail: "Validation failed" }),
  });
  await expect(getChapterQueueStatus(1, 0, "en")).rejects.toMatchObject({
    status: 422,
    message: "Validation failed",
  });
});

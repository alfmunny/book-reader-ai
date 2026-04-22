/**
 * Tests for lib/api.ts
 *
 * All network calls are intercepted via global.fetch mock.
 */

import {
  setAuthToken,
  searchBooks,
  getCachedBooks,
  getBookMeta,
  getBookChapters,
  getInsight,
  translateText,
  getTranslationCache,
  saveTranslationCache,
  getBookTranslationStatus,
  askQuestion,
  synthesizeSpeech,
  getTtsChunks,
  getMe,
  saveGeminiKey,
  deleteGeminiKey,
  retryChapterTranslation,
  enqueueBookTranslation,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    statusText: "Bad Request",
    json: jest.fn().mockResolvedValue(body),
    blob: jest.fn().mockResolvedValue(new Blob(["mp3"], { type: "audio/mpeg" })),
  });
}

beforeEach(() => {
  setAuthToken(null);
});

// ── Auth token ────────────────────────────────────────────────────────────────

test("request includes Authorization header when token is set", async () => {
  setAuthToken("my-jwt");
  mockFetch({ count: 0, books: [] });
  await searchBooks("test");
  const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
  expect(headers.Authorization).toBe("Bearer my-jwt");
});

test("request omits Authorization header when token is null", async () => {
  mockFetch({ count: 0, books: [] });
  await searchBooks("test");
  const headers = (global.fetch as jest.Mock).mock.calls[0][1]?.headers ?? {};
  expect(headers.Authorization).toBeUndefined();
});

// ── Error handling ────────────────────────────────────────────────────────────

test("throws with detail message on non-ok response", async () => {
  mockFetch({ detail: "Not found" }, false);
  await expect(getBookMeta(999)).rejects.toThrow("Not found");
});

test("throws fallback message when response has no detail", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    statusText: "Internal Server Error",
    json: jest.fn().mockRejectedValue(new Error("no json")),
  });
  await expect(getBookMeta(999)).rejects.toThrow("Internal Server Error");
});

// ── Books ─────────────────────────────────────────────────────────────────────

test("searchBooks builds correct URL with query", async () => {
  mockFetch({ count: 1, books: [] });
  await searchBooks("Pride");
  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).toContain("/books/search");
  expect(url).toContain("q=Pride");
});

test("searchBooks includes language param when provided", async () => {
  mockFetch({ count: 0, books: [] });
  await searchBooks("Faust", "de");
  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).toContain("language=de");
});

test("searchBooks includes page param", async () => {
  mockFetch({ count: 0, books: [] });
  await searchBooks("x", "", 3);
  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).toContain("page=3");
});

test("getCachedBooks calls /books/cached", async () => {
  mockFetch([]);
  await getCachedBooks();
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain("/books/cached");
});

test("getBookMeta calls /books/:id", async () => {
  mockFetch({ id: 1342 });
  await getBookMeta(1342);
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain("/books/1342");
});

test("getBookChapters calls /books/:id/chapters", async () => {
  mockFetch({ book_id: 1342, chapters: [], meta: {}, images: [] });
  await getBookChapters(1342);
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain("/books/1342/chapters");
});

// ── AI ────────────────────────────────────────────────────────────────────────

test("getInsight sends POST to /ai/insight", async () => {
  mockFetch({ insight: "Deep." });
  const result = await getInsight("text", "Faust", "Goethe");
  expect(result.insight).toBe("Deep.");
  const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain("/ai/insight");
  expect(opts.method).toBe("POST");
});

test("translateText sends correct body", async () => {
  mockFetch({ paragraphs: ["Hello"], cached: false });
  await translateText("Hallo", "de", "en", 1342, 0);
  const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
  expect(body.text).toBe("Hallo");
  expect(body.source_language).toBe("de");
  expect(body.target_language).toBe("en");
  expect(body.book_id).toBe(1342);
  expect(body.chapter_index).toBe(0);
});

test("getTranslationCache returns paragraphs + provider on hit", async () => {
  mockFetch({ paragraphs: ["Translated"], provider: "gemini", model: "flash", cached: true });
  const result = await getTranslationCache(1342, 0, "en");
  expect(result?.paragraphs).toEqual(["Translated"]);
  expect(result?.provider).toBe("gemini");
  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).toContain("/ai/translate/cache");
  expect(url).toContain("book_id=1342");
});

test("getTranslationCache returns null on miss", async () => {
  mockFetch({ detail: "Not cached" }, false);
  const result = await getTranslationCache(999, 0, "en");
  expect(result).toBeNull();
});

test("saveTranslationCache sends PUT", async () => {
  mockFetch({ ok: true });
  await saveTranslationCache(1342, 0, "en", ["Hello"]);
  const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain("/ai/translate/cache");
  expect(opts.method).toBe("PUT");
  const body = JSON.parse(opts.body);
  expect(body.book_id).toBe(1342);
  expect(body.paragraphs).toEqual(["Hello"]);
});

test("getBookTranslationStatus builds the correct URL and parses the response", async () => {
  mockFetch({
    book_id: 1342, target_language: "zh",
    total_chapters: 10, translated_chapters: 3, bulk_active: true,
  });
  const result = await getBookTranslationStatus(1342, "zh");
  expect(result.translated_chapters).toBe(3);
  expect(result.bulk_active).toBe(true);
  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).toContain("/books/1342/translation-status");
  expect(url).toContain("target_language=zh");
});

test("askQuestion sends POST to /ai/qa", async () => {
  mockFetch({ answer: "42" });
  const result = await askQuestion("What?", "passage", "Book", "Author");
  expect(result.answer).toBe("42");
});

// ── TTS ───────────────────────────────────────────────────────────────────────

const mockTtsResponse = (extra?: Record<string, string>) => ({
  ok: true,
  headers: { get: jest.fn().mockImplementation((h: string) => extra?.[h] ?? null) },
  blob: jest.fn().mockResolvedValue(new Blob(["mp3"])),
});

test("synthesizeSpeech returns a blob URL", async () => {
  global.URL.createObjectURL = jest.fn().mockReturnValue("blob:fake-url");
  global.fetch = jest.fn().mockResolvedValue(mockTtsResponse());
  const { url } = await synthesizeSpeech("Hello", "en", 1.0);
  expect(url).toBe("blob:fake-url");
});

test("synthesizeSpeech defaults gender to 'female'", async () => {
  global.URL.createObjectURL = jest.fn().mockReturnValue("blob:fake");
  global.fetch = jest.fn().mockResolvedValue(mockTtsResponse());
  await synthesizeSpeech("Hello", "en");
  const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
  expect(body.gender).toBe("female");
});

test("synthesizeSpeech sends explicit gender value", async () => {
  global.URL.createObjectURL = jest.fn().mockReturnValue("blob:fake");
  global.fetch = jest.fn().mockResolvedValue(mockTtsResponse());
  await synthesizeSpeech("Hello", "en", 1.0, "male");
  const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
  expect(body.gender).toBe("male");
});

test("synthesizeSpeech forwards an AbortSignal to fetch", async () => {
  global.URL.createObjectURL = jest.fn().mockReturnValue("blob:fake");
  global.fetch = jest.fn().mockResolvedValue(mockTtsResponse());
  const abort = new AbortController();
  await synthesizeSpeech("Hello", "en", 1.0, "female", abort.signal);
  const opts = (global.fetch as jest.Mock).mock.calls[0][1];
  expect(opts.signal).toBe(abort.signal);
});

test("synthesizeSpeech parses X-TTS-Timings header into wordBoundaries", async () => {
  global.URL.createObjectURL = jest.fn().mockReturnValue("blob:fake");
  const timings = [{ offset_ms: 100, text: "Hello" }, { offset_ms: 400, text: "world" }];
  global.fetch = jest.fn().mockResolvedValue(
    mockTtsResponse({ "X-TTS-Timings": JSON.stringify(timings) })
  );
  const { wordBoundaries } = await synthesizeSpeech("Hello world", "en", 1.0);
  expect(wordBoundaries).toEqual(timings);
});

test("getTtsChunks calls /ai/tts/chunks and returns the chunk list", async () => {
  mockFetch({ chunks: ["first chunk", "second chunk", "third chunk"] });
  const chunks = await getTtsChunks("the full chapter text");
  expect(chunks).toEqual(["first chunk", "second chunk", "third chunk"]);
  const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain("/ai/tts/chunks");
  expect(opts.method).toBe("POST");
  expect(JSON.parse(opts.body).text).toBe("the full chapter text");
});

test("synthesizeSpeech throws on non-ok response", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    statusText: "Bad Request",
    json: jest.fn().mockResolvedValue({}),
  });
  await expect(synthesizeSpeech("Hello", "en")).rejects.toThrow("TTS failed");
});

test("synthesizeSpeech falls back to empty wordBoundaries on malformed X-TTS-Timings", async () => {
  global.URL.createObjectURL = jest.fn().mockReturnValue("blob:fake");
  global.fetch = jest.fn().mockResolvedValue(
    mockTtsResponse({ "X-TTS-Timings": "not valid json{{" })
  );
  const { wordBoundaries } = await synthesizeSpeech("Hello", "en", 1.0);
  expect(wordBoundaries).toEqual([]);
});

// ── User ──────────────────────────────────────────────────────────────────────

test("getMe calls /user/me", async () => {
  mockFetch({ id: 1, email: "a@b.com", name: "A", picture: "", hasGeminiKey: false });
  const result = await getMe();
  expect(result.email).toBe("a@b.com");
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain("/user/me");
});

test("saveGeminiKey sends POST to /user/gemini-key", async () => {
  mockFetch({ ok: true });
  await saveGeminiKey("my-key");
  const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain("/user/gemini-key");
  expect(opts.method).toBe("POST");
  expect(JSON.parse(opts.body).api_key).toBe("my-key");
});

test("deleteGeminiKey sends DELETE", async () => {
  mockFetch({ ok: true });
  await deleteGeminiKey();
  expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe("DELETE");
});

// ── Chapter translation retry ────────────────────────────────────────────────

test("retryChapterTranslation POSTs to the explicit retry URL", async () => {
  // Distinct from requestChapterTranslation: the normal request uses
  // INSERT OR IGNORE on the queue, which silently no-ops on failed rows.
  // Retry hits a separate endpoint that resets the row to pending.
  mockFetch({ status: "pending", position: 1, attempts: 0 });
  await retryChapterTranslation(1342, 5, "zh");
  const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain("/books/1342/chapters/5/translation/retry");
  expect(opts.method).toBe("POST");
  expect(JSON.parse(opts.body).target_language).toBe("zh");
});

test("enqueueBookTranslation POSTs to /books/{id}/translations/enqueue-all", async () => {
  // Reader-side whole-book translate button. Body shape mirrors the
  // per-chapter translation endpoint so the backend can reuse the
  // RequestTranslationBody pydantic model.
  mockFetch({ ok: true, enqueued: 3 });
  const res = await enqueueBookTranslation(1342, "zh");
  expect(res.enqueued).toBe(3);
  const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain("/books/1342/translations/enqueue-all");
  expect(opts.method).toBe("POST");
  expect(JSON.parse(opts.body).target_language).toBe("zh");
});

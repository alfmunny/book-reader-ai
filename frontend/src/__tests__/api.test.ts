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
  askQuestion,
  checkPronunciation,
  synthesizeSpeech,
  findVideos,
  searchAudiobooks,
  getAudiobook,
  saveAudiobook,
  deleteAudiobook,
  getMe,
  saveGeminiKey,
  deleteGeminiKey,
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

test("askQuestion sends POST to /ai/qa", async () => {
  mockFetch({ answer: "42" });
  const result = await askQuestion("What?", "passage", "Book", "Author");
  expect(result.answer).toBe("42");
});

test("checkPronunciation sends POST to /ai/pronunciation", async () => {
  mockFetch({ feedback: "Good!" });
  const result = await checkPronunciation("Hello", "Helo");
  expect(result.feedback).toBe("Good!");
});

test("findVideos sends POST to /ai/videos", async () => {
  mockFetch({ query: "Faust opera", videos: [] });
  const result = await findVideos("passage", "Faust", "Goethe");
  expect(result.query).toBe("Faust opera");
});

// ── TTS ───────────────────────────────────────────────────────────────────────

test("synthesizeSpeech returns a blob URL", async () => {
  global.URL.createObjectURL = jest.fn().mockReturnValue("blob:fake-url");
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    blob: jest.fn().mockResolvedValue(new Blob(["mp3"])),
  });
  const url = await synthesizeSpeech("Hello", "en", 1.0);
  expect(url).toBe("blob:fake-url");
});

test("synthesizeSpeech throws on non-ok response", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  await expect(synthesizeSpeech("Hello", "en")).rejects.toThrow("TTS failed");
});

// ── Audiobooks ────────────────────────────────────────────────────────────────

test("searchAudiobooks builds URL with title param", async () => {
  mockFetch({ results: [] });
  await searchAudiobooks(1342, "Faust", "Goethe");
  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).toContain("/audiobooks/1342/search");
  expect(url).toContain("title=Faust");
  expect(url).toContain("author=Goethe");
});

test("searchAudiobooks omits author when not provided", async () => {
  mockFetch({ results: [] });
  await searchAudiobooks(1342, "Faust");
  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).not.toContain("author=");
});

test("getAudiobook calls /audiobooks/:id", async () => {
  mockFetch({ id: "librivox-1" });
  await getAudiobook(1342);
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain("/audiobooks/1342");
});

test("saveAudiobook sends POST", async () => {
  mockFetch({ ok: true });
  const ab = { id: "librivox-1", title: "Faust", authors: [], url_librivox: "", url_rss: "", sections: [] };
  await saveAudiobook(1342, ab);
  expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe("POST");
});

test("deleteAudiobook sends DELETE", async () => {
  mockFetch({ ok: true });
  await deleteAudiobook(1342);
  expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe("DELETE");
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

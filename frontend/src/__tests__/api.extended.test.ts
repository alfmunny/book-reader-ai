/**
 * Extended tests for lib/api.ts — annotations, vocabulary, insights,
 * reading progress, user management, and obsidian settings.
 */

import {
  setAuthToken,
  getMe,
  saveGeminiKey,
  deleteGeminiKey,
  getReadingProgress,
  saveReadingProgress,
  getAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getVocabulary,
  saveVocabularyWord,
  deleteVocabularyWord,
  exportVocabularyToObsidian,
  getInsights,
  saveInsight,
  deleteInsight,
  getObsidianSettings,
  saveObsidianSettings,
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

// ── User / Auth ───────────────────────────────────────────────────────────────

test("getMe hits /user/me", async () => {
  mockFetch({ id: 1, email: "a@b.com", name: "A", picture: "", hasGeminiKey: true, role: "user", approved: true, plan: "free" });
  const me = await getMe();
  expect(fetchUrl()).toContain("/user/me");
  expect(me.id).toBe(1);
  expect(me.hasGeminiKey).toBe(true);
});

test("saveGeminiKey POSTs to /user/gemini-key with key in body", async () => {
  mockFetch({ ok: true });
  await saveGeminiKey("my-api-key");
  expect(fetchUrl()).toContain("/user/gemini-key");
  expect(fetchMethod()).toBe("POST");
  expect(fetchBody()).toEqual({ api_key: "my-api-key" });
});

test("deleteGeminiKey DELETEs /user/gemini-key", async () => {
  mockFetch({ ok: true });
  await deleteGeminiKey();
  expect(fetchUrl()).toContain("/user/gemini-key");
  expect(fetchMethod()).toBe("DELETE");
});

// ── Reading progress ──────────────────────────────────────────────────────────

test("getReadingProgress hits /user/reading-progress and returns entries", async () => {
  const entries = [{ book_id: 1, chapter_index: 3, last_read: "2024-01-01" }];
  mockFetch({ entries });
  const result = await getReadingProgress();
  expect(fetchUrl()).toContain("/user/reading-progress");
  expect(result).toEqual(entries);
});

test("saveReadingProgress PUTs correct book_id in URL and chapter_index in body", async () => {
  mockFetch({ ok: true });
  await saveReadingProgress(42, 7);
  expect(fetchUrl()).toContain("/user/reading-progress/42");
  expect(fetchMethod()).toBe("PUT");
  expect(fetchBody()).toEqual({ chapter_index: 7 });
});

// ── Annotations ───────────────────────────────────────────────────────────────

test("getAnnotations hits /annotations with book_id param", async () => {
  mockFetch([]);
  await getAnnotations(5);
  expect(fetchUrl()).toContain("/annotations?book_id=5");
});

test("getAnnotations returns annotation array", async () => {
  const ann = { id: 1, book_id: 5, chapter_index: 0, sentence_text: "Hello", note_text: "Note", color: "yellow" };
  mockFetch([ann]);
  const result = await getAnnotations(5);
  expect(result).toEqual([ann]);
});

test("createAnnotation POSTs to /annotations", async () => {
  const data = { book_id: 1, chapter_index: 0, sentence_text: "Hello", note_text: "My note", color: "yellow" };
  mockFetch({ id: 10, ...data });
  await createAnnotation(data);
  expect(fetchMethod()).toBe("POST");
  expect(fetchUrl()).toContain("/annotations");
  expect(fetchBody()).toMatchObject(data);
});

test("updateAnnotation PATCHes /annotations/:id", async () => {
  mockFetch({ id: 3, note_text: "Updated", color: "blue" });
  await updateAnnotation(3, { note_text: "Updated", color: "blue" });
  expect(fetchMethod()).toBe("PATCH");
  expect(fetchUrl()).toContain("/annotations/3");
  expect(fetchBody()).toEqual({ note_text: "Updated", color: "blue" });
});

test("deleteAnnotation DELETEs /annotations/:id", async () => {
  mockFetch({ ok: true });
  await deleteAnnotation(7);
  expect(fetchMethod()).toBe("DELETE");
  expect(fetchUrl()).toContain("/annotations/7");
});

// ── Vocabulary ────────────────────────────────────────────────────────────────

test("getVocabulary hits /vocabulary", async () => {
  mockFetch([]);
  await getVocabulary();
  expect(fetchUrl()).toContain("/vocabulary");
});

test("saveVocabularyWord POSTs with correct fields", async () => {
  mockFetch({ ok: true });
  await saveVocabularyWord({ word: "Weltschmerz", book_id: 1, chapter_index: 2, sentence_text: "The Weltschmerz." });
  expect(fetchMethod()).toBe("POST");
  expect(fetchBody()).toMatchObject({ word: "Weltschmerz", book_id: 1, chapter_index: 2 });
});

test("deleteVocabularyWord DELETEs with URL-encoded word", async () => {
  mockFetch({ ok: true });
  await deleteVocabularyWord("Weltschmerz");
  expect(fetchMethod()).toBe("DELETE");
  expect(fetchUrl()).toContain("/vocabulary/Weltschmerz");
});

test("deleteVocabularyWord encodes special chars", async () => {
  mockFetch({ ok: true });
  await deleteVocabularyWord("über die");
  const url = fetchUrl();
  expect(url).toContain(encodeURIComponent("über die"));
});

test("exportVocabularyToObsidian POSTs with target_language", async () => {
  mockFetch({ urls: ["https://github.com/..."] });
  const result = await exportVocabularyToObsidian(undefined, "de");
  expect(fetchMethod()).toBe("POST");
  expect(fetchBody()).toEqual({ target_language: "de" });
  expect(result.urls).toHaveLength(1);
});

test("exportVocabularyToObsidian includes book_id when provided", async () => {
  mockFetch({ urls: [] });
  await exportVocabularyToObsidian(42, "zh");
  expect(fetchBody()).toMatchObject({ book_id: 42, target_language: "zh" });
});

// ── Book insights ─────────────────────────────────────────────────────────────

test("getInsights hits /insights with book_id param", async () => {
  mockFetch([]);
  await getInsights(99);
  expect(fetchUrl()).toContain("/insights?book_id=99");
});

test("saveInsight POSTs to /insights", async () => {
  const data = { book_id: 1, chapter_index: 0, question: "What is the theme?", answer: "Love." };
  mockFetch({ id: 1, ...data, created_at: "2024-01-01" });
  const result = await saveInsight(data);
  expect(fetchMethod()).toBe("POST");
  expect(fetchBody()).toMatchObject(data);
  expect(result.question).toBe("What is the theme?");
});

test("saveInsight works without chapter_index", async () => {
  const data = { book_id: 2, question: "Who wrote this?", answer: "Unknown." };
  mockFetch({ id: 2, ...data, chapter_index: null, created_at: "2024-01-01" });
  await saveInsight(data);
  const body = fetchBody() as Record<string, unknown>;
  expect(body.chapter_index).toBeUndefined();
});

test("deleteInsight DELETEs /insights/:id", async () => {
  mockFetch({ ok: true });
  await deleteInsight(5);
  expect(fetchMethod()).toBe("DELETE");
  expect(fetchUrl()).toContain("/insights/5");
});

// ── Obsidian settings ─────────────────────────────────────────────────────────

test("getObsidianSettings hits /user/obsidian-settings", async () => {
  mockFetch({ obsidian_repo: "user/repo", obsidian_path: "/notes" });
  const result = await getObsidianSettings();
  expect(fetchUrl()).toContain("/user/obsidian-settings");
  expect(result.obsidian_repo).toBe("user/repo");
});

test("saveObsidianSettings PATCHes with correct payload", async () => {
  mockFetch({ ok: true });
  await saveObsidianSettings({ github_token: "ghp_xxx", obsidian_repo: "user/repo", obsidian_path: "/notes" });
  expect(fetchMethod()).toBe("PATCH");
  expect(fetchBody()).toMatchObject({ github_token: "ghp_xxx", obsidian_repo: "user/repo" });
});

test("saveObsidianSettings works without github_token", async () => {
  mockFetch({ ok: true });
  await saveObsidianSettings({ obsidian_repo: "user/notes", obsidian_path: "/vault" });
  const body = fetchBody() as Record<string, unknown>;
  expect(body.github_token).toBeUndefined();
  expect(body.obsidian_repo).toBe("user/notes");
});

// ── Error propagation ─────────────────────────────────────────────────────────

test("getAnnotations throws ApiError on non-ok response", async () => {
  mockFetch({ detail: "Unauthorized" }, false, 401);
  await expect(getAnnotations(1)).rejects.toThrow("Unauthorized");
});

test("saveVocabularyWord throws on server error", async () => {
  mockFetch({ detail: "DB error" }, false, 500);
  await expect(saveVocabularyWord({ word: "x", book_id: 1, chapter_index: 0, sentence_text: "s" })).rejects.toThrow("DB error");
});

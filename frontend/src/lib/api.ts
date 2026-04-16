const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// ── Auth token + session-settled gate ──────────────────────────────────────
//
// The auth token is injected by Providers → TokenSync once NextAuth finishes
// hydrating. On a page refresh there's a brief window where the session is
// still "loading" and the token hasn't arrived. Previously that window
// caused API calls to fire without a Bearer header, which the backend
// rejected as 401 — pages like /admin or /reader then redirected to home
// in their .catch handlers, making refresh look like a logout bug.
//
// Now we gate `request()` on the session being settled: TokenSync calls
// `markSessionSettled()` once `useSession()` reports a non-loading status,
// and every outbound request waits for that signal. If the session settles
// to "authenticated", the token is set first and the request goes through
// normally. If it settles to "unauthenticated", requests fail with a 401
// exactly once, not a redirect-to-home race.

let _authToken: string | null = null;
let _sessionSettled = false;
const _settledWaiters: Array<() => void> = [];

export function setAuthToken(token: string | null) {
  _authToken = token;
}

/** Called by Providers/TokenSync when NextAuth's session status is no longer
 *  "loading" — i.e. we know whether the user is authenticated or not. */
export function markSessionSettled() {
  if (_sessionSettled) return;
  _sessionSettled = true;
  const waiters = [..._settledWaiters];
  _settledWaiters.length = 0;
  waiters.forEach((r) => r());
}

/** Await the session being settled. Useful for pages that do their own
 *  direct fetch() and need to make sure the Bearer token has arrived from
 *  NextAuth before firing the request. */
export function awaitSession(): Promise<void> {
  if (_sessionSettled) return Promise.resolve();
  return new Promise<void>((resolve) => _settledWaiters.push(resolve));
}

export function getAuthToken(): string | null {
  return _authToken;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // Wait for NextAuth to finish hydrating before firing the request. Without
  // this, refreshing a protected page races the token setup and the backend
  // returns 401 before the token is available.
  await awaitSession();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
    ...(_authToken ? { Authorization: `Bearer ${_authToken}` } : {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

// Books
export function searchBooks(query: string, language = "", page = 1) {
  const params = new URLSearchParams({ q: query, page: String(page) });
  if (language) params.set("language", language);
  return request<{ count: number; books: BookMeta[] }>(`/books/search?${params}`);
}

export function getCachedBooks() {
  return request<BookMeta[]>("/books/cached");
}

export function getPopularBooks(language = "") {
  const params = language ? `?language=${language}` : "";
  return request<BookMeta[]>(`/books/popular${params}`);
}

export function getBookMeta(id: number) {
  return request<BookMeta>(`/books/${id}`);
}

export function getBookChapters(id: number) {
  return request<{ book_id: number; meta: BookMeta; chapters: BookChapter[] }>(`/books/${id}/chapters`);
}

export interface BookChapter {
  title: string;
  text: string;
}

/** An event streamed from GET /books/:id/import-stream. */
export interface ImportEvent {
  event: "stage" | "meta" | "chapters" | "progress" | "done" | "error";
  stage?: "fetching" | "splitting" | "translating" | "tts";
  message?: string;
  progress?: number;
  total?: number;
  current?: number;
  title?: string;
  cached?: boolean;
  skipped?: boolean;
  error?: string;
  book_id?: number;
  source_language?: string;
  titles?: string[];
  provider?: string;
  voice?: string;
}

/**
 * Start the interactive book import stream. Uses fetch() with a streaming
 * response body so the Bearer token works (EventSource can't set headers).
 * Returns an async iterator of ImportEvent objects.
 */
export async function* importBookStream(
  bookId: number,
  targetLanguage: string,
  generateTts: boolean,
  signal?: AbortSignal,
): AsyncGenerator<ImportEvent> {
  await awaitSession();
  const params = new URLSearchParams({
    target_language: targetLanguage,
    generate_tts: generateTts ? "true" : "false",
  });
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    ...(_authToken ? { Authorization: `Bearer ${_authToken}` } : {}),
  };
  const res = await fetch(`${BASE}/books/${bookId}/import-stream?${params}`, {
    headers,
    signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Import stream failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by blank lines.
    let sepIdx: number;
    while ((sepIdx = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      let event = "";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data = line.slice(5).trim();
      }
      if (!event) continue;
      try {
        yield { event: event as ImportEvent["event"], ...JSON.parse(data) };
      } catch {
        // malformed frame — skip
      }
    }
  }
}

// AI
export function getInsight(chapter_text: string, book_title: string, author: string, response_language = "en") {
  return request<{ insight: string }>("/ai/insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapter_text, book_title, author, response_language }),
  });
}

export function translateText(
  text: string,
  source_language: string,
  target_language: string,
  book_id?: number,
  chapter_index?: number,
  provider: "auto" | "gemini" | "google" = "auto",
) {
  return request<{ paragraphs: string[]; cached: boolean; provider?: string; fallback?: boolean }>("/ai/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source_language, target_language, book_id, chapter_index, provider }),
  });
}

/** Check if a translation is already cached. Returns {paragraphs, provider, model} or null. */
export async function getTranslationCache(
  bookId: number,
  chapterIndex: number,
  targetLanguage: string,
): Promise<{ paragraphs: string[]; provider?: string; model?: string } | null> {
  try {
    const data = await request<{ paragraphs: string[]; provider?: string; model?: string }>(
      `/ai/translate/cache?book_id=${bookId}&chapter_index=${chapterIndex}&target_language=${targetLanguage}`
    );
    return data;
  } catch {
    return null;
  }
}

/** Lightweight public endpoint — how many chapters of a book are translated? */
export interface TranslationStatus {
  book_id: number;
  target_language: string;
  total_chapters: number;
  translated_chapters: number;
  bulk_active: boolean;
}

export function getBookTranslationStatus(
  bookId: number,
  targetLanguage: string,
): Promise<TranslationStatus> {
  return request<TranslationStatus>(
    `/books/${bookId}/translation-status?target_language=${targetLanguage}`,
  );
}

/** Save a completed progressive translation to the backend cache. */
export function saveTranslationCache(
  bookId: number,
  chapterIndex: number,
  targetLanguage: string,
  paragraphs: string[],
) {
  return request<{ ok: boolean }>("/ai/translate/cache", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book_id: bookId, chapter_index: chapterIndex, target_language: targetLanguage, paragraphs }),
  });
}

/** Delete a cached translation (admin). */
export function deleteTranslationCache(bookId: number, chapterIndex: number, targetLanguage: string) {
  return request<{ ok: boolean; deleted: number }>(
    `/admin/translations/${bookId}/${chapterIndex}/${targetLanguage}`,
    { method: "DELETE" },
  );
}

export function askQuestion(
  question: string,
  passage: string,
  book_title: string,
  author: string,
  response_language = "en"
) {
  return request<{ answer: string }>("/ai/qa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, passage, book_title, author, response_language }),
  });
}


/**
 * Synthesize text via the backend TTS service.
 * Returns a blob URL that can be passed to new Audio(url).play().
 * The URL should be revoked with URL.revokeObjectURL() when done.
 *
 * The `provider` field selects the backend ("auto" lets the server pick
 * Google Gemini TTS if the user has a Gemini key, else falls back to
 * Microsoft Edge TTS). Authorization is required, so the call goes
 * through `request`-style headers.
 */
export interface SynthesizeOptions {
  /** Backend caches the result when both bookId and chapterIndex are present. */
  bookId?: number;
  chapterIndex?: number;
  /** Index of this chunk within the chapter (used as part of the cache key). */
  chunkIndex?: number;
  signal?: AbortSignal;
}

export async function synthesizeSpeech(
  text: string,
  language: string,
  rate = 1.0,
  provider: "auto" | "edge" | "google" = "auto",
  options: SynthesizeOptions = {}
): Promise<string> {
  await awaitSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(_authToken ? { Authorization: `Bearer ${_authToken}` } : {}),
  };
  const body: Record<string, unknown> = { text, language, rate, provider };
  if (options.bookId !== undefined) body.book_id = options.bookId;
  if (options.chapterIndex !== undefined) body.chapter_index = options.chapterIndex;
  if (options.chunkIndex !== undefined) body.chunk_index = options.chunkIndex;

  const res = await fetch(`${BASE}/ai/tts`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!res.ok) {
    // Surface the backend's error detail when available so users see e.g.
    // "Gemini API key required" instead of a generic "TTS failed".
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "TTS failed");
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Ask the backend how it would chunk the given text. The frontend calls this
 * once per chapter, then fetches one audio file per chunk via synthesizeSpeech
 * — this way the chunking algorithm has exactly one implementation (Python)
 * and the frontend can show per-chunk progress without replicating it.
 */
export async function getTtsChunks(text: string): Promise<string[]> {
  const data = await request<{ chunks: string[] }>("/ai/tts/chunks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return data.chunks;
}

/**
 * Delete all cached audio chunks for a chapter, across providers and voices.
 * Used by the Regenerate button so the next ▶ Read triggers a fresh
 * generation pass instead of returning cached audio.
 */
export function deleteAudioCache(bookId: number, chapterIndex: number) {
  return request<{ deleted: number }>(
    `/ai/tts/cache?book_id=${bookId}&chapter_index=${chapterIndex}`,
    { method: "DELETE" }
  );
}

export function getReferences(
  book_title: string,
  author: string,
  chapter_title = "",
  chapter_excerpt = "",
  response_language = "en"
) {
  return request<{ references: string }>("/ai/references", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book_title, author, chapter_title, chapter_excerpt, response_language }),
  });
}

// Types
export interface BookMeta {
  id: number;
  title: string;
  authors: string[];
  languages: string[];
  subjects: string[];
  download_count: number;
  cover: string;
}

// Audiobooks
export interface AudioSection {
  number: number;
  title: string;
  duration: string;
  url: string;
}

export interface Audiobook {
  id: string;
  title: string;
  authors: string[];
  url_librivox: string;
  url_rss: string;
  sections: AudioSection[];
}

export function searchAudiobooks(bookId: number, title: string, author = "") {
  const p = new URLSearchParams({ title });
  if (author) p.set("author", author);
  return request<{ results: Audiobook[] }>(`/audiobooks/${bookId}/search?${p}`);
}

export function getAudiobook(bookId: number) {
  return request<Audiobook>(`/audiobooks/${bookId}`);
}

export function saveAudiobook(bookId: number, audiobook: Audiobook) {
  return request<{ ok: boolean }>(`/audiobooks/${bookId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(audiobook),
  });
}

export function deleteAudiobook(bookId: number) {
  return request<{ ok: boolean }>(`/audiobooks/${bookId}`, { method: "DELETE" });
}

// User / Auth
export function getMe() {
  return request<{
    id: number;
    email: string;
    name: string;
    picture: string;
    hasGeminiKey: boolean;
    role: string;
    approved: boolean;
  }>("/user/me");
}

export function saveGeminiKey(api_key: string) {
  return request<{ ok: boolean }>("/user/gemini-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key }),
  });
}

export function deleteGeminiKey() {
  return request<{ ok: boolean }>("/user/gemini-key", { method: "DELETE" });
}

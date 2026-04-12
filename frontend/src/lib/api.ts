const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// Set by Providers → TokenSync on session change
let _authToken: string | null = null;
export function setAuthToken(token: string | null) {
  _authToken = token;
}
export function getAuthToken(): string | null {
  return _authToken;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
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
) {
  return request<{ paragraphs: string[]; cached: boolean }>("/ai/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source_language, target_language, book_id, chapter_index }),
  });
}

/** Check if a translation is already cached. Returns paragraphs or null. */
export async function getTranslationCache(
  bookId: number,
  chapterIndex: number,
  targetLanguage: string,
): Promise<string[] | null> {
  try {
    const data = await request<{ paragraphs: string[] }>(
      `/ai/translate/cache?book_id=${bookId}&chapter_index=${chapterIndex}&target_language=${targetLanguage}`
    );
    return data.paragraphs;
  } catch {
    return null;
  }
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

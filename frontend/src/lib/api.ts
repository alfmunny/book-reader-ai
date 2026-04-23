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

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
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
    throw new ApiError(res.status, err.detail || "Request failed");
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

export interface PopularBooksResponse {
  books: BookMeta[];
  total: number;
  page: number;
  per_page: number;
}

export function getPopularBooks(language = "", page = 1) {
  const params = new URLSearchParams({ page: String(page) });
  if (language) params.set("language", language);
  return request<PopularBooksResponse>(`/books/popular?${params}`);
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
  stage?: "fetching" | "splitting";
  message?: string;
  progress?: number;
  total?: number;
  total_words?: number;
  current?: number;
  title?: string;
  cached?: boolean;
  skipped?: boolean;
  error?: string;
  book_id?: number;
  source_language?: string;
  titles?: string[];
}

/**
 * Start the interactive book import stream. Uses fetch() with a streaming
 * response body so the Bearer token works (EventSource can't set headers).
 * Returns an async iterator of ImportEvent objects.
 */
export async function* importBookStream(
  bookId: number,
  signal?: AbortSignal,
): AsyncGenerator<ImportEvent> {
  await awaitSession();
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    ...(_authToken ? { Authorization: `Bearer ${_authToken}` } : {}),
  };
  const res = await fetch(`${BASE}/books/${bookId}/import-stream`, {
    headers,
    signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, err.detail || "Import stream failed");
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

export function generateChapterSummary(
  book_id: number,
  chapter_index: number,
  chapter_text: string,
  book_title: string,
  author: string,
  chapter_title = "",
) {
  return request<{ summary: string; cached: boolean; model?: string }>("/ai/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book_id, chapter_index, chapter_text, book_title, author, chapter_title }),
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
  queue_pending?: number;
  queue_running?: number;
  queue_failed?: number;
  queue_done?: number;
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

/** Is a specific chapter queued for background translation?
 * Returned by the reader page before it fires an on-demand translate —
 * if the chapter is already pending/running, we wait for the worker
 * instead of duplicating the call.
 */
export interface ChapterQueueStatus {
  queued: boolean;
  status: "pending" | "running" | "done" | "failed" | "skipped" | null;
  position: number | null; // 1-based position among pending rows
  attempts: number;
}

export function getChapterQueueStatus(
  bookId: number,
  chapterIndex: number,
  targetLanguage: string,
): Promise<ChapterQueueStatus> {
  return request<ChapterQueueStatus>(
    `/books/${bookId}/chapters/${chapterIndex}/queue-status?target_language=${encodeURIComponent(targetLanguage)}`,
  );
}

/** Returns the cached translation if available, throws ApiError(404) if not.
 * Never enqueues — safe to call on page load. */
export function getChapterTranslation(
  bookId: number,
  chapterIndex: number,
  targetLanguage: string,
): Promise<ChapterTranslationResponse> {
  return request<ChapterTranslationResponse>(
    `/books/${bookId}/chapters/${chapterIndex}/translation?target_language=${encodeURIComponent(targetLanguage)}`,
  );
}

/** Reader-side unified translate endpoint. Returns the cached translation
 * if available, otherwise enqueues the chapter (high priority) and
 * returns queue status. Reader polls until status === 'ready'. */
export interface ChapterTranslationResponse {
  status: "ready" | "pending" | "running" | "failed" | "skipped";
  paragraphs?: string[];
  provider?: string;
  model?: string;
  position?: number | null;
  attempts?: number;
  // Translated chapter title ("第一章" instead of "CHAPTER I."), null
  // when the row was saved before title translation was supported or
  // the translator didn't produce one.
  title_translation?: string | null;
  // True when the queue worker is actually running. Reader shows a
  // distinct "worker offline" message when queued but !worker_running.
  worker_running?: boolean;
}

export function requestChapterTranslation(
  bookId: number,
  chapterIndex: number,
  targetLanguage: string,
): Promise<ChapterTranslationResponse> {
  return request<ChapterTranslationResponse>(
    `/books/${bookId}/chapters/${chapterIndex}/translation`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_language: targetLanguage }),
    },
  );
}

export function retryChapterTranslation(
  bookId: number,
  chapterIndex: number,
  targetLanguage: string,
): Promise<ChapterTranslationResponse> {
  return request<ChapterTranslationResponse>(
    `/books/${bookId}/chapters/${chapterIndex}/translation/retry`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_language: targetLanguage }),
    },
  );
}

export function enqueueBookTranslation(
  bookId: number,
  targetLanguage: string,
): Promise<{ ok: boolean; enqueued: number }> {
  return request<{ ok: boolean; enqueued: number }>(
    `/books/${bookId}/translations/enqueue-all`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_language: targetLanguage }),
    },
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
  response_language = "en",
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
export interface WordBoundary {
  offset_ms: number;
  text: string;
}

export async function synthesizeSpeech(
  text: string,
  language: string,
  rate = 1.0,
  gender: "female" | "male" = "female",
  signal?: AbortSignal,
): Promise<{ url: string; wordBoundaries: WordBoundary[] }> {
  const res = await fetch(`${BASE}/ai/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language, rate, gender }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "TTS failed");
  }
  const timingsHeader = res.headers.get("X-TTS-Timings");
  let wordBoundaries: WordBoundary[] = [];
  if (timingsHeader) {
    try {
      wordBoundaries = JSON.parse(timingsHeader) as WordBoundary[];
    } catch {
      // malformed header — proceed without word boundaries
    }
  }
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), wordBoundaries };
}

export async function getTtsChunks(text: string): Promise<string[]> {
  const data = await request<{ chunks: string[] }>("/ai/tts/chunks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return data.chunks;
}

export function getReferences(
  book_title: string,
  author: string,
  chapter_title = "",
  chapter_excerpt = "",
  response_language = "en",
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
  original_language?: string;
  source?: string;
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
    plan: string;
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

export interface ReadingProgressEntry {
  book_id: number;
  chapter_index: number;
  last_read: string;
}

export function getReadingProgress() {
  return request<{ entries: ReadingProgressEntry[] }>("/user/reading-progress").then((d) => d.entries);
}

export function saveReadingProgress(bookId: number, chapterIndex: number) {
  return request<{ ok: boolean }>(`/user/reading-progress/${bookId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapter_index: chapterIndex }),
  });
}

export interface UserStats {
  totals: {
    books_started: number;
    vocabulary_words: number;
    annotations: number;
    insights: number;
  };
  streak: number;
  longest_streak: number;
  activity: { date: string; count: number }[];
}

export function getUserStats() {
  return request<UserStats>("/user/stats");
}

// ── Annotations ───────────────────────────────────────────────────────────────

export interface Annotation {
  id: number;
  book_id: number;
  chapter_index: number;
  sentence_text: string;
  note_text: string;
  color: string;
  created_at?: string;
}

export interface AnnotationWithBook extends Annotation {
  book_title: string | null;
}

export function getAnnotations(bookId: number) {
  return request<Annotation[]>(`/annotations?book_id=${bookId}`);
}

export function getAllAnnotations() {
  return request<AnnotationWithBook[]>("/annotations/all");
}

export function createAnnotation(data: {
  book_id: number;
  chapter_index: number;
  sentence_text: string;
  note_text: string;
  color: string;
}) {
  return request<Annotation>("/annotations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateAnnotation(id: number, data: { note_text?: string; color?: string }) {
  return request<Annotation>(`/annotations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteAnnotation(id: number) {
  return request<{ ok: boolean }>(`/annotations/${id}`, { method: "DELETE" });
}

// ── Vocabulary ────────────────────────────────────────────────────────────────

export interface VocabularyOccurrence {
  book_id: number;
  book_title: string;
  chapter_index: number;
  sentence_text: string;
}

export interface VocabularyWord {
  id: number;
  word: string;
  lemma?: string | null;
  language?: string | null;
  created_at?: string | null;
  occurrences: VocabularyOccurrence[];
}

export interface WordDefinition {
  lemma: string;
  language: string;
  definitions: Array<{ pos: string; text: string }>;
  url: string;
}

export function getVocabulary() {
  return request<VocabularyWord[]>("/vocabulary");
}

export function saveVocabularyWord(data: {
  word: string;
  book_id: number;
  chapter_index: number;
  sentence_text: string;
}) {
  return request<{ ok: boolean }>("/vocabulary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteVocabularyWord(word: string) {
  return request<{ ok: boolean }>(`/vocabulary/${encodeURIComponent(word)}`, {
    method: "DELETE",
  });
}

export function getWordDefinition(word: string, lang?: string) {
  const params = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  return request<WordDefinition>(`/vocabulary/definition/${encodeURIComponent(word)}${params}`);
}

export function exportVocabularyToObsidian(bookId?: number, targetLanguage = "zh") {
  return request<{ urls: string[] }>("/vocabulary/export/obsidian", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(bookId !== undefined ? { book_id: bookId } : {}),
      target_language: targetLanguage,
    }),
  });
}

// ── Book Insights (saved AI Q&A) ──────────────────────────────────────────────

export interface BookInsight {
  id: number;
  book_id: number;
  chapter_index: number | null;
  question: string;
  answer: string;
  context_text?: string | null;
  created_at: string;
}

export interface BookInsightWithBook extends BookInsight {
  book_title: string | null;
}

export function getInsights(bookId: number) {
  return request<BookInsight[]>(`/insights?book_id=${bookId}`);
}

export function getAllInsights() {
  return request<BookInsightWithBook[]>("/insights/all");
}

export function saveInsight(data: {
  book_id: number;
  chapter_index?: number;
  question: string;
  answer: string;
  context_text?: string;
}) {
  return request<BookInsight>("/insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteInsight(id: number) {
  return request<{ ok: boolean }>(`/insights/${id}`, { method: "DELETE" });
}

// ── Obsidian settings ─────────────────────────────────────────────────────────

export interface ObsidianSettings {
  obsidian_repo: string;
  obsidian_path: string;
  has_github_token: boolean;
}

export function getObsidianSettings() {
  return request<ObsidianSettings>("/user/obsidian-settings");
}

export function saveObsidianSettings(data: {
  github_token?: string;
  obsidian_repo: string;
  obsidian_path: string;
}) {
  return request<{ ok: boolean }>("/user/obsidian-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ── Book uploads ──────────────────────────────────────────────────────────────

export interface UploadQuota { used: number; max: number; }
export interface DraftChapter { index: number; title: string; preview: string; word_count: number; }
export interface UploadResult { book_id: number; title: string; author: string; format: string; detected_chapters: DraftChapter[]; }

export function uploadBook(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  return request<UploadResult>("/books/upload", { method: "POST", body: form });
}

export function getUploadQuota(): Promise<UploadQuota> {
  return request<UploadQuota>("/books/upload/quota");
}

export function getDraftChapters(bookId: number): Promise<{ chapters: DraftChapter[] }> {
  return request("/books/" + bookId + "/chapters/draft");
}

export function confirmChapters(bookId: number, chapters: { title: string; original_index: number }[]): Promise<{ ok: boolean; chapter_count: number }> {
  return request("/books/" + bookId + "/chapters/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapters }),
  });
}

export function deleteUploadedBook(bookId: number): Promise<{ ok: boolean }> {
  return request("/books/upload/" + bookId, { method: "DELETE" });
}

// ── Flashcards / SRS (issue #556) ────────────────────────────────────────────

export interface Flashcard {
  vocabulary_id: number;
  word: string;
  due_date: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  last_reviewed_at: string | null;
  saved_at: string | null;
}

export interface FlashcardReviewResult {
  vocabulary_id: number;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  next_due: string;
}

export interface FlashcardStats {
  total: number;
  due_today: number;
  reviewed_today: number;
}

export function getDueFlashcards() {
  return request<Flashcard[]>("/vocabulary/flashcards/due");
}

export function reviewFlashcard(vocabularyId: number, grade: number) {
  return request<FlashcardReviewResult>(`/vocabulary/flashcards/${vocabularyId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grade }),
  });
}

export function getFlashcardStats() {
  return request<FlashcardStats>("/vocabulary/flashcards/stats");
}

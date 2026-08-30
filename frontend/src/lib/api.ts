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
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Books
export function searchBooks(query: string, language = "", page = 1) {
  const params = new URLSearchParams({ q: query, page: String(page) });
  if (language) params.set("language", language);
  return request<{ count: number; books: BookMeta[] }>(`/books/search?${params}`);
}

// In-app FTS5 search over user content (issue #648).
export type InAppSearchResult =
  | {
      type: "annotation";
      id: number;
      book_id: number;
      book_title: string;
      chapter_index: number;
      snippet: string;
      note_text: string;
      book_language?: string;
    }
  | {
      type: "vocabulary";
      word: string;
      language?: string;
      occurrence_id: number;
      book_id: number;
      book_title: string;
      chapter_index: number;
      snippet: string;
    }
  | {
      type: "chapter";
      id: number;
      book_id: number;
      book_title: string;
      chapter_index: number;
      chapter_title: string;
      snippet: string;
      book_language?: string;
    };

export interface InAppSearchResponse {
  query: string;
  results: InAppSearchResult[];
  total: number;
}

export function searchInAppContent(
  q: string,
  scope?: Array<"annotations" | "vocabulary" | "chapters">,
  limit = 20,
) {
  const params = new URLSearchParams({ q, limit: String(limit) });
  if (scope && scope.length) params.set("scope", scope.join(","));
  return request<InAppSearchResponse>(`/search?${params}`);
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

/** The published catalog — audited books only (#2711). */
export function getCatalogBooks() {
  return request<BookMeta[]>("/books/catalog");
}

export function getPopularBooks(language = "", page = 1) {
  const params = new URLSearchParams({ page: String(page) });
  if (language) params.set("language", language);
  return request<PopularBooksResponse>(`/books/popular?${params}`);
}

export function getBookMeta(id: number) {
  return request<BookMeta>(`/books/${id}`);
}

export type ChapterSource = "upload" | "epub" | "text";

export function getBookChapters(id: number) {
  return request<{ book_id: number; meta: BookMeta; chapter_source: ChapterSource; chapters: BookChapter[] }>(`/books/${id}/chapters`);
}

export interface BookChapter {
  title: string;
  text: string;
  /**
   * "frontmatter" for a printed contents page, title page or translator's
   * note; null for body text (#2755). Only frozen books carry labels, so
   * this is absent for anything split at runtime.
   */
  role?: string | null;
  /**
   * The part, act or book this chapter belongs to, verbatim from the source
   * ("ACT I", "PREMIÈRE PARTIE"). Null for a chapter belonging to no part —
   * a book without parts, or Crime and Punishment's epilogue (#2745 Phase 2).
   */
  part?: string | null;
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
export function getInsight(
  chapter_text: string,
  book_title: string,
  author: string,
  response_language = "en",
  provider: ChatProvider = "auto",
) {
  return request<{ insight: string; provider: string }>("/ai/insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapter_text, book_title, author, response_language, provider }),
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
  /**
   * Which chapters are translated, not just how many — the reader's Contents
   * panel marks each row (#2754). Optional so an older backend, or a failed
   * fetch, leaves the panel silent rather than claiming nothing is translated.
   */
  translated_indices?: number[];
  bulk_active: boolean;
}

export interface BookTranslationLanguages {
  book_id: number;
  total_chapters: number;
  languages: Array<{ target_language: string; translated_chapters: number }>;
}

export function getBookTranslationLanguages(bookId: number) {
  return request<BookTranslationLanguages>(`/books/${bookId}/translation-languages`);
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

export type ChatProvider = "auto" | "gemini" | "claude" | "deepseek";

export function askQuestion(
  question: string,
  passage: string,
  book_title: string,
  author: string,
  response_language = "en",
  provider: ChatProvider = "auto",
) {
  return request<{ answer: string; provider: string }>("/ai/qa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, passage, book_title, author, response_language, provider }),
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
    hasClaudeKey: boolean;
    hasDeepseekKey: boolean;
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

export function saveClaudeKey(api_key: string) {
  return request<{ ok: boolean }>("/user/claude-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key }),
  });
}

export function deleteClaudeKey() {
  return request<{ ok: boolean }>("/user/claude-key", { method: "DELETE" });
}

export function saveDeepseekKey(api_key: string) {
  return request<{ ok: boolean }>("/user/deepseek-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key }),
  });
}

export function deleteDeepseekKey() {
  return request<{ ok: boolean }>("/user/deepseek-key", { method: "DELETE" });
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
  book_language?: string | null;
  chapter_index: number;
  sentence_text: string;
  /** The exact form met in the text ("verhöhnt") — the entry's word is the
   *  base form. NULL on occurrences saved before migration 043. */
  surface_form?: string | null;
}

export interface VocabularyWord {
  id: number;
  word: string;
  lemma?: string | null;
  language?: string | null;
  created_at?: string | null;
  /** Meaning captured at save time, rendered without a lookup (#2704). */
  definitions?: Array<{ pos: string; text: string }>;
  form_of?: string | null;
  definition_url?: string | null;
  definition_lang?: string | null;
  occurrences: VocabularyOccurrence[];
}

export interface WordDefinition {
  lemma: string;
  language: string;
  definitions: Array<{ pos: string; text: string }>;
  /** e.g. "past participle of gehen" when `lemma` differs from the word looked up. */
  form_of?: string | null;
  /** The language the definitions are *written in* — may differ from what was
   *  requested when the chain fell back to English. */
  definition_lang?: string | null;
  /** True when served from the saved vocabulary rather than a live lookup. */
  cached?: boolean;
  url: string;
}

export function getVocabulary() {
  return request<VocabularyWord[]>("/vocabulary");
}

export function saveVocabularyWord(data: {
  word: string;
  /** Base form, when the caller already has a definition — skips a server lookup. */
  lemma?: string;
  /** The meaning already in hand, stored once at save time instead of re-fetched. */
  definitions?: Array<{ pos: string; text: string }>;
  form_of?: string | null;
  definition_url?: string | null;
  definition_lang?: string | null;
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

export function getWordDefinition(word: string, lang?: string, target?: string) {
  const qs = new URLSearchParams();
  if (lang) qs.set("lang", lang);
  if (target) qs.set("target", target);
  const params = qs.toString() ? `?${qs}` : "";
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

export interface VocabTagSummary {
  tag: string;
  word_count: number;
}

export function listVocabularyTags() {
  return request<VocabTagSummary[]>("/vocabulary/tags");
}

export function getVocabularyWordTags(vocabularyId: number) {
  return request<string[]>(`/vocabulary/${vocabularyId}/tags`);
}

export function addVocabularyWordTag(vocabularyId: number, tag: string) {
  return request<{ tag: string }>(`/vocabulary/${vocabularyId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag }),
  });
}

export function removeVocabularyWordTag(vocabularyId: number, tag: string) {
  return request<void>(
    `/vocabulary/${vocabularyId}/tags/${encodeURIComponent(tag)}`,
    { method: "DELETE" },
  );
}

export type DeckMode = "manual" | "smart";

export interface DeckSummary {
  id: number;
  name: string;
  description: string;
  mode: DeckMode;
  rules_json: string | null;
  created_at: string;
  updated_at: string;
  member_count: number;
  due_today: number;
}

export interface DeckDetail extends Omit<DeckSummary, "due_today"> {
  members: number[];
}

export interface DeckCreatePayload {
  name: string;
  description?: string;
  mode: DeckMode;
  rules_json?: Record<string, unknown> | null;
}

export function listDecks() {
  return request<DeckSummary[]>("/decks");
}

export function getDeck(id: number) {
  return request<DeckDetail>(`/decks/${id}`);
}

export function createDeck(payload: DeckCreatePayload) {
  return request<DeckDetail>("/decks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteDeck(id: number) {
  return request<void>(`/decks/${id}`, { method: "DELETE" });
}

export function addDeckMember(deckId: number, vocabularyId: number) {
  return request<{ vocabulary_id: number }>(`/decks/${deckId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vocabulary_id: vocabularyId }),
  });
}

export function removeDeckMember(deckId: number, vocabularyId: number) {
  return request<void>(`/decks/${deckId}/members/${vocabularyId}`, {
    method: "DELETE",
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

export function updateInsight(id: number, data: { question: string }) {
  return request<BookInsight>(`/insights/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ── Translation sessions (design: docs/design/user-translations.md, #2740) ──

export type SessionProvider = "deepseek" | "claude";

export interface TranslationSession {
  id: number;
  book_id: number;
  name: string;
  target_language: string;
  style_prompt?: string | null;
  provider: SessionProvider;
  status: string;
  created_at?: string;
  updated_at?: string;
  /** chapter_index → translated paragraph count */
  coverage: Record<string, number>;
}

export interface SessionParagraph {
  text: string;
  provider: string;
  model: string;
  edited_by_user: boolean;
}

export interface ChapterRun {
  active: boolean;
  done: number;
  total: number;
  error: string | null;
}

export interface SessionChapter {
  session_id: number;
  chapter_index: number;
  paragraph_count: number;
  paragraphs: Record<string, SessionParagraph>;
  /** Background chapter-translation run, when one is (or just was) active. */
  run?: ChapterRun | null;
}

/** A whole-book translation another reader published — the Community
 *  group in the version switcher (track B, #2752). */
export interface PublishedSession extends TranslationSession {
  author_name: string;
  author_picture?: string | null;
  published_at?: string | null;
  chapters_covered: number;
  model_tags: string[];
  likes: number;
  comments: number;
}

export interface SessionCompleteness {
  total_paragraphs: number;
  translated_paragraphs: number;
  complete: boolean;
  missing_chapters: Array<{ chapter_index: number; translated: number; paragraphs: number }>;
}

export function listPublishedSessions(
  bookId: number,
  opts: { q?: string; sort?: "popular" | "recent"; limit?: number; offset?: number } = {},
) {
  const p = new URLSearchParams({ book_id: String(bookId) });
  if (opts.q) p.set("q", opts.q);
  if (opts.sort) p.set("sort", opts.sort);
  if (opts.limit != null) p.set("limit", String(opts.limit));
  if (opts.offset != null) p.set("offset", String(opts.offset));
  return request<{ items: PublishedSession[]; has_more: boolean }>(`/translation-sessions/published?${p}`);
}

export function getSessionCompleteness(sessionId: number) {
  return request<SessionCompleteness>(`/translation-sessions/${sessionId}/completeness`);
}

export function publishTranslationSession(sessionId: number) {
  return request<TranslationSession>(`/translation-sessions/${sessionId}/publish`, { method: "POST" });
}

export function unpublishTranslationSession(sessionId: number) {
  return request<TranslationSession>(`/translation-sessions/${sessionId}/publish`, { method: "DELETE" });
}

export function listTranslationSessions(bookId: number) {
  return request<TranslationSession[]>(`/translation-sessions?book_id=${bookId}`);
}

export function createTranslationSession(data: {
  book_id: number;
  name: string;
  status?: "private" | "public";
  target_language: string;
  provider: SessionProvider;
  style_prompt?: string;
}) {
  return request<TranslationSession>("/translation-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateTranslationSession(
  id: number,
  data: { name?: string; style_prompt?: string; provider?: SessionProvider; target_language?: string; status?: "private" | "public" },
) {
  return request<TranslationSession>(`/translation-sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteTranslationSession(id: number) {
  return request<{ ok: boolean }>(`/translation-sessions/${id}`, { method: "DELETE" });
}

export function getSessionChapter(sessionId: number, chapterIndex: number) {
  return request<SessionChapter>(`/translation-sessions/${sessionId}/chapters/${chapterIndex}`);
}

export function translateSession(
  sessionId: number,
  data: { chapter_index: number; scope: "chapter" | number; provider?: SessionProvider; force?: boolean },
) {
  return request<SessionChapter>(`/translation-sessions/${sessionId}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function editSessionParagraph(
  sessionId: number, chapterIndex: number, paragraphIndex: number, text: string,
) {
  return request<SessionParagraph>(
    `/translation-sessions/${sessionId}/chapters/${chapterIndex}/paragraphs/${paragraphIndex}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) },
  );
}

export function deleteSessionParagraph(
  sessionId: number, chapterIndex: number, paragraphIndex: number,
) {
  return request<{ ok: boolean }>(
    `/translation-sessions/${sessionId}/chapters/${chapterIndex}/paragraphs/${paragraphIndex}`,
    { method: "DELETE" },
  );
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
export interface DraftChapter {
  index: number;
  /** Row key on the server — what PATCH addresses. */
  chapter_index?: number;
  title: string;
  /** Full chapter text. A preview is not enough to judge a split on (#audit). */
  text?: string;
  preview: string;
  word_count: number;
  reviewed?: boolean;
}
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

/** Save titles and review ticks. The autosave path — never carries text. */
export function saveDraftChapterMeta(
  bookId: number,
  chapters: { chapter_index: number; title?: string; reviewed?: boolean }[],
): Promise<{ ok: boolean; updated_at: string }> {
  return request("/books/" + bookId + "/chapters/draft", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapters }),
  });
}

/** Replace the whole draft structure. Used after a split or merge moves text. */
export function saveDraftChapterStructure(
  bookId: number,
  chapters: { title: string; text: string; reviewed?: boolean }[],
): Promise<{ ok: boolean; chapter_count: number; updated_at: string }> {
  return request("/books/" + bookId + "/chapters/draft", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapters }),
  });
}

export interface DraftAudit {
  book_id: number;
  title: string;
  authors: string[];
  chapter_count: number;
  reviewed_count: number;
  updated_at: string | null;
}

export interface FrozenSplit {
  chapters: { index: number; title: string; text: string }[];
  editable: boolean;
  blocked_by: Record<string, number>;
}

/** The confirmed split of your own book, so a mistake can still be corrected. */
export function getFrozenSplit(bookId: number): Promise<FrozenSplit> {
  return request(`/books/${bookId}/chapters/frozen`);
}

export function saveFrozenSplit(
  bookId: number,
  chapters: { title: string; text: string }[],
): Promise<{ ok: boolean; chapter_count: number }> {
  return request(`/books/${bookId}/chapters/frozen`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapters }),
  });
}

/** Ids of books this reader uploaded themselves — the shelf badge source. */
export function getMyUploads(): Promise<{ id: number; title: string }[]> {
  return request("/books/uploads/mine");
}

/** Books this reader has started auditing but not finished. */
export function getDraftAudits(): Promise<DraftAudit[]> {
  return request("/books/uploads/drafts");
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
  context: string | null;
  language?: string;
  /** Stored meaning, so the card back needs no lookup on first review. */
  definitions?: Array<{ pos: string; text: string }>;
  form_of?: string | null;
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

export function getDueFlashcards(deckId?: number) {
  const qs = deckId ? `?deck_id=${deckId}` : "";
  return request<Flashcard[]>(`/vocabulary/flashcards/due${qs}`);
}

export function reviewFlashcard(vocabularyId: number, grade: number) {
  return request<FlashcardReviewResult>(`/vocabulary/flashcards/${vocabularyId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grade }),
  });
}

export function getFlashcardStats(deckId?: number) {
  const qs = deckId ? `?deck_id=${deckId}` : "";
  return request<FlashcardStats>(`/vocabulary/flashcards/stats${qs}`);
}

// ── Chat history (server-side persistence, issue #907) ────────────────────────

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ChatMessagesResponse {
  messages: ChatMessage[];
  has_more: boolean;
}

export function getChatMessages(bookId: string | number, limit = 50, beforeId?: number) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId != null) params.set("before_id", String(beforeId));
  return request<ChatMessagesResponse>(`/chat/${bookId}/messages?${params}`);
}

export function postChatMessage(bookId: string | number, role: "user" | "assistant", content: string) {
  return request<ChatMessage>(`/chat/${bookId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, content }),
  });
}

export function clearChatMessages(bookId: string | number) {
  return request<{ deleted: number }>(`/chat/${bookId}/messages`, { method: "DELETE" });
}

// ── Stories: the generic share pipeline (design: user-translations.md
//    phase 2, #2752). One pipeline for every kind — no per-kind forks. ──────

export type StoryKind = "translation" | "note";

export interface StoryParagraph {
  paragraph_index: number;
  text: string;
  model: string;
}

export interface Story {
  id: number;
  user_id: number;
  kind: StoryKind;
  book_id: number;
  chapter_index: number;
  session_id?: number | null;
  paragraph_start?: number | null;
  paragraph_end?: number | null;
  annotation_id?: number | null;
  caption?: string | null;
  created_at: string;
  author_name: string;
  author_picture?: string | null;
  comment_count: number;
  // kind='translation' (live references — never snapshots)
  session_name?: string | null;
  target_language?: string | null;
  paragraphs?: StoryParagraph[];
  // kind='note'
  sentence_text?: string | null;
  note_text?: string | null;
  color?: string | null;
  // feed only
  book_title?: string;
  following_author?: boolean;
}

export interface StoryComment {
  id: number;
  story_id?: number | null;
  user_id: number;
  body: string;
  created_at: string;
  author_name: string;
  author_picture?: string | null;
  parent_comment_id?: number | null;
  visibility?: "public" | "private";
  /** The passage its author had selected (notes anchor to the paragraph). */
  quote?: string | null;
}

/** Anchor for comments on an EDITORIAL paragraph (no story row exists). */
export interface EditorialCommentAnchor {
  book_id: number;
  target_language: string;
  chapter_index: number;
  paragraph_index: number;
}

/** Anchor for notes on ONE version's rendering of a paragraph — notes
 *  belong to the version you are reading (owner, 2026-08-30). */
export interface SessionParagraphAnchor {
  session_id: number;
  chapter_index: number;
  paragraph_index: number;
}

export function createStory(data: {
  kind: StoryKind;
  book_id: number;
  chapter_index: number;
  session_id?: number;
  paragraph_start?: number;
  paragraph_end?: number;
  annotation_id?: number;
  caption?: string;
}) {
  return request<Story>(`/stories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function listStories(bookId: number, chapterIndex?: number) {
  const params = new URLSearchParams({ book_id: String(bookId) });
  if (chapterIndex != null) params.set("chapter_index", String(chapterIndex));
  return request<{ stories: Story[] }>(`/stories?${params}`);
}

export function getStoryFeed(scope: "all" | "following" = "all") {
  return request<{ stories: Story[] }>(`/stories/feed?scope=${scope}`);
}

export function followUser(userId: number) {
  return request<{ ok: boolean }>(`/stories/follow/${userId}`, { method: "POST" });
}

export function unfollowUser(userId: number) {
  return request<{ ok: boolean }>(`/stories/follow/${userId}`, { method: "DELETE" });
}

export function deleteStory(storyId: number) {
  return request<{ ok: boolean }>(`/stories/${storyId}`, { method: "DELETE" });
}

export function listStoryComments(storyId: number) {
  return request<{ comments: StoryComment[] }>(`/stories/${storyId}/comments`);
}

export function addStoryComment(storyId: number, body: string, parentId?: number, visibility?: "public" | "private", quote?: string) {
  return request<StoryComment>(`/stories/${storyId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, ...(parentId != null ? { parent_id: parentId } : {}), ...(visibility ? { visibility } : {}), ...(quote ? { quote } : {}) }),
  });
}

export function listVersionComments(sessionId: number) {
  return request<{ comments: StoryComment[] }>(`/stories/comments/version?session_id=${sessionId}`);
}

export function addVersionComment(sessionId: number, body: string) {
  return request<StoryComment>(`/stories/comments/version`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, body }),
  });
}

export function listSessionParagraphComments(anchor: SessionParagraphAnchor) {
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(anchor).map(([k, v]) => [k, String(v)])),
  );
  return request<{ comments: StoryComment[] }>(`/stories/comments/session?${params}`);
}

export function addSessionParagraphComment(anchor: SessionParagraphAnchor, body: string, parentId?: number, visibility?: "public" | "private", quote?: string) {
  return request<StoryComment>(`/stories/comments/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...anchor, body, ...(parentId != null ? { parent_id: parentId } : {}), ...(visibility ? { visibility } : {}), ...(quote ? { quote } : {}) }),
  });
}

export function getParagraphNoteCounts(params: {
  chapter_index: number;
  session_id?: number;
  book_id?: number;
  target_language?: string;
}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null) q.set(k, String(v)); });
  return request<{ counts: Record<string, number> }>(`/stories/comments/counts?${q}`);
}

export function listEditorialComments(anchor: EditorialCommentAnchor) {
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(anchor).map(([k, v]) => [k, String(v)])),
  );
  return request<{ comments: StoryComment[] }>(`/stories/comments/editorial?${params}`);
}

export function addEditorialComment(anchor: EditorialCommentAnchor, body: string, parentId?: number, visibility?: "public" | "private", quote?: string) {
  return request<StoryComment>(`/stories/comments/editorial`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...anchor, body, ...(parentId != null ? { parent_id: parentId } : {}), ...(visibility ? { visibility } : {}), ...(quote ? { quote } : {}) }),
  });
}

export interface ReactionState { count: number; liked: boolean }

export function toggleReaction(targetKind: "story" | "comment" | "session", targetId: number) {
  return request<{ liked: boolean; count: number }>(`/stories/reactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_kind: targetKind, target_id: targetId }),
  });
}

export function listReactions(targetKind: "story" | "comment" | "session", ids: number[]) {
  return request<{ reactions: Record<string, ReactionState> }>(
    `/stories/reactions?target_kind=${targetKind}&ids=${ids.join(",")}`,
  );
}

export function updateStoryComment(
  commentId: number,
  data: { body: string; visibility?: "public" | "private" },
) {
  return request<StoryComment>(`/stories/comments/${commentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteStoryComment(commentId: number) {
  return request<{ ok: boolean }>(`/stories/comments/${commentId}`, { method: "DELETE" });
}

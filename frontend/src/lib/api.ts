const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// Set by Providers → TokenSync on session change
let _authToken: string | null = null;
export function setAuthToken(token: string | null) {
  _authToken = token;
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

export function getBookMeta(id: number) {
  return request<BookMeta>(`/books/${id}`);
}

export function getBookChapters(id: number) {
  return request<{ book_id: number; meta: BookMeta; chapters: BookChapter[]; images: BookImage[] }>(`/books/${id}/chapters`);
}

export interface BookChapter {
  title: string;
  text: string;
}

export interface BookImage {
  url: string;
  caption: string;
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

export function checkPronunciation(
  original_text: string,
  spoken_text: string,
  language = "en"
) {
  return request<{ feedback: string }>("/ai/pronunciation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ original_text, spoken_text, language }),
  });
}

/**
 * Synthesize text via the backend Edge TTS service.
 * Returns a blob URL that can be passed to new Audio(url).play().
 * The URL should be revoked with URL.revokeObjectURL() when done.
 */
export async function synthesizeSpeech(
  text: string,
  language: string,
  rate = 1.0
): Promise<string> {
  const res = await fetch(`${BASE}/ai/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language, rate }),
  });
  if (!res.ok) throw new Error("TTS failed");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function findVideos(passage: string, book_title: string, author: string) {
  return request<{ query: string; videos: VideoResult[] }>("/ai/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passage, book_title, author }),
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

export interface VideoResult {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
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

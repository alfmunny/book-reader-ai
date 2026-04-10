const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
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

export function translateText(text: string, source_language: string, target_language: string) {
  return request<{ paragraphs: string[] }>("/ai/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source_language, target_language }),
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

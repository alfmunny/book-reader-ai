import { getAuthToken, awaitSession } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export async function adminFetch(path: string, options?: RequestInit) {
  await awaitSession();
  const token = getAuthToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options?.headers as Record<string, string>) || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export interface Stats {
  users_total: number;
  users_approved: number;
  users_pending: number;
  books_cached: number;
  audio_chunks_cached: number;
  audio_cache_mb: number;
  translations_cached: number;
}

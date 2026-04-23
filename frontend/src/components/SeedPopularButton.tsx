"use client";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, AlertCircleIcon } from "@/components/Icons";

type AdminFetch = (path: string, options?: RequestInit) => Promise<any>;

interface Props {
  adminFetch: AdminFetch;
  onComplete?: () => void;   // called once per completion so parent can refresh books list
}

interface JobState {
  status: "idle" | "running" | "completed" | "cancelled" | "failed";
  total: number;
  current: number;
  downloaded: number;
  failed: number;
  already_cached: number;
  current_book_id: number | null;
  current_book_title: string;
  last_error: string;
  started_at: string | null;
  ended_at: string | null;
  log: Array<{
    event: "downloaded" | "failed";
    book_id: number;
    title: string;
    chars?: number;
    error?: string;
  }>;
}

interface StatusResp {
  running: boolean;
  state: JobState;
}

export default function SeedPopularButton({ adminFetch, onComplete }: Props) {
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedKeyRef = useRef<string | null>(null);

  async function refresh() {
    try {
      const s = await adminFetch("/admin/books/seed-popular/status") as StatusResp;
      setStatus(s);
      // Fire onComplete exactly once per completion (keyed by started_at).
      if (
        s.state.status === "completed" &&
        s.state.started_at &&
        completedKeyRef.current !== s.state.started_at
      ) {
        completedKeyRef.current = s.state.started_at;
        onComplete?.();
      }
    } catch {
      /* swallow polling errors */
    }
  }

  useEffect(() => {
    refresh();
    // Poll every 2 seconds. The job lives on the server independently, so
    // the poll keeps working across page navigation and even reloads.
    pollRef.current = setInterval(refresh, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    if (!confirm(
      "Download every popular book listed in popular_books.json into the DB.\n\n" +
      "This hits Gutenberg for each uncached book (~1 second each). Books " +
      "already cached are skipped. Can take 5–15 minutes.\n\n" +
      "The job runs in the background — you can navigate away and come back; " +
      "progress keeps going on the server."
    )) return;
    setError("");
    setExpanded(true);
    try {
      await adminFetch("/admin/books/seed-popular/start", { method: "POST" });
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Start failed");
    }
  }

  async function stop() {
    if (!confirm("Stop the seed job? Already-downloaded books stay cached.")) return;
    try {
      await adminFetch("/admin/books/seed-popular/stop", { method: "POST" });
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Stop failed");
    }
  }

  const state = status?.state;
  const running = status?.running ?? false;
  const pct = state && state.total > 0
    ? Math.round((state.current / state.total) * 100)
    : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={start}
          disabled={running}
          className="rounded-lg border border-amber-300 text-amber-700 px-4 py-2 text-sm hover:bg-amber-50 disabled:opacity-50"
        >
          {running ? "Seeding…" : "Seed all popular books"}
        </button>
        {state && state.status !== "idle" && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-amber-700 hover:text-amber-900"
          >
            Show progress
          </button>
        )}
        {state && state.status !== "idle" && expanded && !running && (
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-stone-500 hover:text-stone-700"
          >
            Hide
          </button>
        )}
      </div>

      {expanded && state && state.status !== "idle" && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 text-sm space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="font-medium text-ink">Seed popular books</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                running ? "bg-emerald-100 text-emerald-700" :
                state.status === "completed" ? "bg-amber-100 text-amber-700" :
                state.status === "failed" ? "bg-red-100 text-red-700" :
                state.status === "cancelled" ? "bg-stone-100 text-stone-600" :
                "bg-stone-100 text-stone-600"
              }`}>
                {running ? "Running" : state.status}
              </span>
              {running && (
                <button
                  onClick={stop}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Stop
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded px-2 py-1 text-xs">
              {error}
            </div>
          )}

          {state.total > 0 ? (
            <>
              <div className="flex items-baseline justify-between text-xs text-stone-600">
                <span>
                  {state.current} / {state.total} processed
                  {state.already_cached > 0 && ` · ${state.already_cached} already cached`}
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-600 transition-all duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-stone-500">
              {state.status === "running"
                ? "Planning…"
                : "No books need downloading."}
            </p>
          )}

          {running && state.current_book_title && (
            <p className="text-xs text-amber-700 truncate">
              ↓ {state.current_book_title}
            </p>
          )}

          {state.status === "completed" && (
            <p className="text-xs text-emerald-700 font-medium">
              Done · downloaded {state.downloaded}
              {state.already_cached > 0 && ` · cached ${state.already_cached}`}
              {state.failed > 0 && ` · failed ${state.failed}`}
            </p>
          )}

          {state.log.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-amber-600 cursor-pointer">
                Recent events ({state.log.length})
              </summary>
              <ul className="mt-1 text-xs space-y-0.5 max-h-40 overflow-y-auto">
                {state.log.slice().reverse().map((entry, i) => (
                  <li
                    key={i}
                    className={`font-mono truncate ${
                      entry.event === "failed" ? "text-red-600" : "text-stone-600"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {entry.event === "failed" ? (
                        <AlertCircleIcon className="w-3.5 h-3.5 text-red-600 flex-shrink-0" aria-hidden="true" />
                      ) : (
                        <CheckIcon className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" aria-hidden="true" />
                      )}
                    </span> #{entry.book_id}{" "}
                    {entry.title || ""}
                    {entry.chars ? ` (${Math.round(entry.chars / 1000)}K)` : ""}
                    {entry.error ? ` — ${entry.error}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

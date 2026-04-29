"use client";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, AlertCircleIcon, ChevronDownIcon } from "@/components/Icons";

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
  const [pendingStart, setPendingStart] = useState(false);
  const [pendingStop, setPendingStop] = useState(false);
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

  async function confirmStart() {
    setPendingStart(false);
    setError("");
    setExpanded(true);
    try {
      await adminFetch("/admin/books/seed-popular/start", { method: "POST" });
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Start failed");
    }
  }

  async function confirmStop() {
    setPendingStop(false);
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
      <div className="flex items-center gap-2 flex-wrap">
        {pendingStart ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-amber-800">
              Download all popular books from Gutenberg? (5–15 min, runs in background)
            </span>
            <button
              type="button"
              onClick={confirmStart}
              aria-label="Confirm seed popular books"
              className="rounded-lg border border-emerald-300 text-emerald-700 px-3 py-1.5 min-h-[44px] md:min-h-0 text-sm hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              Yes, start
            </button>
            <button
              type="button"
              onClick={() => setPendingStart(false)}
              aria-label="Cancel seed"
              className="rounded-lg border border-stone-200 text-stone-600 px-3 py-1.5 min-h-[44px] md:min-h-0 text-sm hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setPendingStart(true)}
            disabled={running}
            className="rounded-lg border border-amber-300 text-amber-700 px-4 py-2 min-h-[44px] md:min-h-0 text-sm hover:bg-amber-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            {running ? "Seeding…" : "Seed all popular books"}
          </button>
        )}
        {state && state.status !== "idle" && !expanded && !pendingStart && (
          <button
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            aria-controls="seed-progress-panel"
            className="text-xs text-amber-700 hover:text-amber-900 min-h-[44px] md:min-h-0 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            Show progress
          </button>
        )}
        {state && state.status !== "idle" && expanded && !running && !pendingStart && (
          <button
            onClick={() => setExpanded(false)}
            aria-expanded={true}
            aria-controls="seed-progress-panel"
            className="text-xs text-stone-600 hover:text-stone-700 min-h-[44px] md:min-h-0 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            Hide
          </button>
        )}
      </div>

      {expanded && state && state.status !== "idle" && (
        <div id="seed-progress-panel" className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 text-sm space-y-2">
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
              {running && !pendingStop && (
                <button
                  type="button"
                  onClick={() => setPendingStop(true)}
                  className="text-xs text-red-600 hover:text-red-800 min-h-[44px] md:min-h-0 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                >
                  Stop
                </button>
              )}
              {running && pendingStop && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-red-600 whitespace-nowrap">Stop job?</span>
                  <button
                    type="button"
                    onClick={confirmStop}
                    aria-label="Confirm stop seed job"
                    className="text-xs px-2 py-1 rounded border border-red-400 bg-red-50 text-red-700 min-h-[44px] md:min-h-0 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingStop(false)}
                    aria-label="Cancel stop"
                    className="text-xs px-2 py-1 rounded border border-stone-200 text-stone-600 min-h-[44px] md:min-h-0 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded px-2 py-1 text-xs">
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
              <div
                className="h-1.5 bg-amber-100 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label="Seeding progress"
              >
                <div
                  className="h-full bg-amber-600 transition-all duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-stone-600">
              {state.status === "running"
                ? "Planning…"
                : "No books need downloading."}
            </p>
          )}

          {running && state.current_book_title && (
            <p className="text-xs text-amber-700 truncate flex items-center gap-1" title={state.current_book_title}>
              <ChevronDownIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{state.current_book_title}</span>
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
              <summary className="text-xs text-amber-700 cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
                Recent events ({state.log.length})
              </summary>
              <ul role="list" className="mt-1 text-xs space-y-0.5 max-h-40 overflow-y-auto list-none p-0 m-0">
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

"use client";
/**
 * Interactive book import page.
 *
 * Consumes the /api/books/:id/import-stream SSE endpoint and shows
 * progress for each stage (fetching → splitting → translating → tts).
 * Used when a user opens a book that hasn't been imported yet.
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { importBookStream, ImportEvent, ApiError } from "@/lib/api";
import { getSettings } from "@/lib/settings";

type Stage = "fetching" | "splitting" | "translating" | "tts";

interface StageState {
  status: "pending" | "active" | "done" | "error";
  total: number;
  current: number;
  message: string;
}

const INITIAL: Record<Stage, StageState> = {
  fetching:    { status: "pending", total: 1, current: 0, message: "" },
  splitting:   { status: "pending", total: 1, current: 0, message: "" },
  translating: { status: "pending", total: 1, current: 0, message: "" },
  tts:         { status: "pending", total: 1, current: 0, message: "" },
};

const STAGE_LABELS: Record<Stage, string> = {
  fetching:    "Download text",
  splitting:   "Split chapters",
  translating: "Pre-translate",
  tts:         "Pre-generate audio",
};

export default function BookImportPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();
  const search = useSearchParams();

  // Read "next" param (where to send user after import), default to reader.
  const nextUrl = search.get("next") || `/reader/${bookId}`;

  const [stages, setStages] = useState<Record<Stage, StageState>>(INITIAL);
  const [bookTitle, setBookTitle] = useState("");
  const [chapterCount, setChapterCount] = useState(0);
  const [error, setError] = useState("");
  const [loginRequired, setLoginRequired] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [generateTts, setGenerateTts] = useState(false);
  const [started, setStarted] = useState(false);

  // Target language from user settings
  const targetLangRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    targetLangRef.current = getSettings().translationLang || "en";
  }, []);

  function updateStage(stage: Stage, patch: Partial<StageState>) {
    setStages((prev) => ({ ...prev, [stage]: { ...prev[stage], ...patch } }));
  }

  async function startImport() {
    if (started) return;
    setStarted(true);
    setError("");
    setIsDone(false);

    const abort = new AbortController();
    abortRef.current = abort;

    updateStage("fetching", { status: "active", message: "Starting…" });

    try {
      for await (const ev of importBookStream(
        Number(bookId),
        targetLangRef.current,
        generateTts,
        abort.signal,
      )) {
        handleEvent(ev);
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      if (e instanceof ApiError && e.status === 401) {
        setLoginRequired(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Import failed");
    }
  }

  function handleEvent(ev: ImportEvent) {
    if (ev.event === "error") {
      setError(ev.message || "Import failed");
      if (ev.stage) updateStage(ev.stage as Stage, { status: "error" });
      return;
    }

    if (ev.event === "meta") {
      if (ev.title) setBookTitle(ev.title);
      return;
    }

    if (ev.event === "chapters") {
      setChapterCount(ev.total || 0);
      updateStage("splitting", {
        status: "done",
        total: ev.total || 0,
        current: ev.total || 0,
        message: `Found ${ev.total} chapter${ev.total === 1 ? "" : "s"}`,
      });
      return;
    }

    if (ev.event === "stage" && ev.stage) {
      const stage = ev.stage as Stage;
      // Transition previous stage to "done" if we're moving forward
      setStages((prev) => {
        const next = { ...prev };
        // Walk in order; any stage before the current one that's still active → done
        const order: Stage[] = ["fetching", "splitting", "translating", "tts"];
        const currentIdx = order.indexOf(stage);
        for (let i = 0; i < currentIdx; i++) {
          if (next[order[i]].status === "active") {
            next[order[i]] = { ...next[order[i]], status: "done" };
          }
        }
        next[stage] = {
          ...next[stage],
          status: "active",
          total: ev.total || 1,
          message: ev.message || "",
        };
        return next;
      });
      return;
    }

    if (ev.event === "progress" && ev.stage) {
      updateStage(ev.stage as Stage, {
        current: ev.current || 0,
        message: ev.title || ev.message || "",
      });
      return;
    }

    if (ev.event === "done") {
      // Mark any remaining active stages as done.
      setStages((prev) => {
        const next = { ...prev };
        (Object.keys(next) as Stage[]).forEach((s) => {
          if (next[s].status === "active") {
            next[s] = { ...next[s], status: "done", current: next[s].total };
          }
        });
        return next;
      });
      setIsDone(true);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Auto-redirect when done (with small delay so the user sees "Done")
  useEffect(() => {
    if (!isDone) return;
    const t = setTimeout(() => router.push(nextUrl), 1500);
    return () => clearTimeout(t);
  }, [isDone, nextUrl, router]);

  function cancel() {
    abortRef.current?.abort();
    router.push("/");
  }

  // Skip-ahead: start reading now, let remaining stages run in background
  // (the SSE will keep flowing even if we navigate away — but we abort to be clean).
  function skipToReading() {
    abortRef.current?.abort();
    router.push(nextUrl);
  }

  const canStartReading =
    stages.splitting.status === "done" && chapterCount > 0;

  return (
    <main className="min-h-screen bg-parchment flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="bg-white border border-amber-200 rounded-2xl shadow-sm p-8">
          <h1 className="font-serif text-2xl font-bold text-ink mb-1">
            Preparing your book
          </h1>
          {bookTitle ? (
            <p className="text-amber-700 text-sm mb-6">{bookTitle}</p>
          ) : (
            <p className="text-amber-700 text-sm mb-6">Book ID {bookId}</p>
          )}

          {!started && (
            <div className="space-y-4 mb-6">
              <p className="text-sm text-stone-600">
                We&apos;ll download the book, split it into chapters, and
                pre-translate everything to{" "}
                <span className="font-medium text-ink">
                  {targetLangRef.current}
                </span>{" "}
                so your first read is instant.
              </p>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateTts}
                  onChange={(e) => setGenerateTts(e.target.checked)}
                  className="mt-0.5 accent-amber-700"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-ink">
                    Also pre-generate audio narration
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    Uses free Microsoft Edge voices. Slower — can take several
                    minutes. You can always generate on-demand while reading.
                  </div>
                </div>
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={startImport}
                  className="flex-1 rounded-lg bg-amber-700 text-white py-2.5 text-sm font-medium hover:bg-amber-800"
                >
                  Start import
                </button>
                <button
                  onClick={() => router.push(nextUrl)}
                  className="rounded-lg border border-amber-300 text-amber-700 px-4 py-2.5 text-sm font-medium hover:bg-amber-50"
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {started && (
            <div className="space-y-3 mb-6">
              {(Object.keys(STAGE_LABELS) as Stage[]).map((stage) => {
                const s = stages[stage];
                const icon =
                  s.status === "done" ? "✓"
                  : s.status === "active" ? "…"
                  : s.status === "error" ? "!"
                  : "·";
                const iconColor =
                  s.status === "done" ? "text-emerald-600"
                  : s.status === "active" ? "text-amber-700 animate-pulse"
                  : s.status === "error" ? "text-red-600"
                  : "text-stone-300";
                const pct = s.total > 0
                  ? Math.round((s.current / s.total) * 100)
                  : 0;

                return (
                  <div key={stage} className="">
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className={`font-bold text-base w-4 text-center ${iconColor}`}>
                        {icon}
                      </span>
                      <span className="flex-1 text-sm font-medium text-ink">
                        {STAGE_LABELS[stage]}
                      </span>
                      {s.status === "active" && s.total > 1 && (
                        <span className="text-xs text-amber-600">
                          {s.current} / {s.total}
                        </span>
                      )}
                    </div>
                    {(s.status === "active" || s.status === "done") && s.total > 0 && (
                      <div className="ml-7 h-1 bg-amber-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-150 ${
                            s.status === "done" ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                          style={{ width: `${s.status === "done" ? 100 : pct}%` }}
                        />
                      </div>
                    )}
                    {s.message && s.status === "active" && (
                      <p className="ml-7 mt-1 text-xs text-stone-500 truncate">
                        {s.message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {loginRequired && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center mb-4">
              <p className="font-serif text-base font-semibold text-ink mb-1">Login required</p>
              <p className="text-sm text-amber-800 mb-4">
                Sign in to read this book.
              </p>
              <a
                href="/api/auth/signin"
                className="inline-block rounded-lg bg-amber-700 text-white px-5 py-2 text-sm font-medium hover:bg-amber-800"
              >
                Sign in
              </a>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">
              {error}
            </div>
          )}

          {started && isDone && (
            <p className="text-sm text-emerald-700 mb-4">
              Done — opening your book…
            </p>
          )}

          {started && !isDone && (
            <div className="flex gap-2">
              {canStartReading && (
                <button
                  onClick={skipToReading}
                  className="flex-1 rounded-lg bg-amber-700 text-white py-2 text-sm font-medium hover:bg-amber-800"
                >
                  Start reading now
                </button>
              )}
              <button
                onClick={cancel}
                className="rounded-lg border border-stone-300 text-stone-600 px-4 py-2 text-sm hover:bg-stone-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-stone-400 mt-4">
          Translations and audio are cached, so the next person who opens this
          book hits the cache instantly.
        </p>
      </div>
    </main>
  );
}

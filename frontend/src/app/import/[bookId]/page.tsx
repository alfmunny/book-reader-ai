"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  importBookStream,
  enqueueBookTranslation,
  ImportEvent,
  ApiError,
} from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { CheckCircleIcon, AlertCircleIcon, RetryIcon, CircleDotIcon } from "@/components/Icons";

type Stage = "fetching" | "splitting";

interface StageState {
  status: "pending" | "active" | "done" | "error";
  total: number;
  current: number;
  message: string;
}

const INITIAL: Record<Stage, StageState> = {
  fetching: { status: "pending", total: 1, current: 0, message: "" },
  splitting: { status: "pending", total: 1, current: 0, message: "" },
};

const STAGE_LABELS: Record<Stage, string> = {
  fetching: "Download text",
  splitting: "Split chapters",
};

// Gemini Flash paid-tier pricing for cost estimate display only.
const FLASH_OUTPUT_COST_PER_M = 2.5; // USD per 1M output tokens
const WORDS_PER_CHAPTER_AVG = 2000;
const TOKENS_PER_WORD = 1.4;

function estimateCost(
  chapters: number,
  totalWords?: number,
): { tokens: number; usd: number } {
  const words = totalWords ?? chapters * WORDS_PER_CHAPTER_AVG;
  const tokens = Math.round(words * TOKENS_PER_WORD);
  const usd = (tokens / 1_000_000) * FLASH_OUTPUT_COST_PER_M;
  return { tokens, usd };
}

function fmtCost(usd: number): string {
  if (usd < 0.005) return "< $0.01";
  return `~$${usd.toFixed(2)}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

export default function BookImportPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();
  const search = useSearchParams();

  // Read "next" param (where to send user after import), default to reader.
  const nextUrl = search.get("next") || `/reader/${bookId}`;

  const [stages, setStages] = useState<Record<Stage, StageState>>(INITIAL);
  const [bookTitle, setBookTitle] = useState("");
  const [chapterCount, setChapterCount] = useState(0);
  const [totalWords, setTotalWords] = useState<number | undefined>();
  const [sourceLanguage, setSourceLanguage] = useState("");
  const [error, setError] = useState("");
  const [loginRequired, setLoginRequired] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [started, setStarted] = useState(false);
  // "idle" | "pending" | "enqueued" | "skipped"
  const [translateState, setTranslateState] = useState<
    "idle" | "pending" | "enqueued" | "skipped"
  >("idle");
  const [translateError, setTranslateError] = useState("");

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
      for await (const ev of importBookStream(Number(bookId), abort.signal)) {
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
      if (ev.source_language) setSourceLanguage(ev.source_language);
      return;
    }

    if (ev.event === "chapters") {
      setChapterCount(ev.total || 0);
      setTotalWords(ev.total_words);
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
      setStages((prev) => {
        const next = { ...prev };
        const order: Stage[] = ["fetching", "splitting"];
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
      updateStage(ev.stage, {
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

  // Redirect once done AND user has acted on the translation prompt (or it doesn't apply).
  const translationActioned =
    translateState === "enqueued" || translateState === "skipped";
  const tl = targetLangRef.current;
  const showTranslatePrompt =
    isDone &&
    chapterCount > 0 &&
    !!tl &&
    tl !== sourceLanguage &&
    !translationActioned;
  const readyToRedirect = isDone && (translationActioned || !showTranslatePrompt);

  useEffect(() => {
    if (!readyToRedirect) return;
    const t = setTimeout(() => router.push(nextUrl), 1200);
    return () => clearTimeout(t);
  }, [readyToRedirect, nextUrl, router]);

  function cancel() {
    abortRef.current?.abort();
    router.push("/");
  }

  function skipToReading() {
    abortRef.current?.abort();
    router.push(nextUrl);
  }

  async function handleTranslate() {
    setTranslateState("pending");
    setTranslateError("");
    try {
      await enqueueBookTranslation(Number(bookId), tl);
      setTranslateState("enqueued");
    } catch (e) {
      setTranslateError(
        e instanceof Error ? e.message : "Failed to enqueue translation",
      );
      setTranslateState("idle");
    }
  }

  const canStartReading =
    stages.splitting.status === "done" && chapterCount > 0;
  const cost = estimateCost(chapterCount, totalWords);

  return (
    <main id="main-content" className="min-h-screen bg-parchment flex items-center justify-center px-4 py-8">
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
                We&apos;ll download the book and split it into chapters so you
                can start reading right away.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={startImport}
                  className="flex-1 rounded-lg bg-amber-700 text-white min-h-[44px] text-sm font-medium hover:bg-amber-800 flex items-center justify-center"
                >
                  Start import
                </button>
                <button
                  onClick={() => router.push(nextUrl)}
                  className="rounded-lg border border-amber-300 text-amber-700 px-4 min-h-[44px] text-sm font-medium hover:bg-amber-50 flex items-center"
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
                  s.status === "done"
                    ? <CheckCircleIcon className="w-4 h-4" />
                    : s.status === "active"
                      ? <RetryIcon className="w-4 h-4 animate-spin" />
                      : s.status === "error"
                        ? <AlertCircleIcon className="w-4 h-4" />
                        : <CircleDotIcon className="w-4 h-4" />;
                const iconColor =
                  s.status === "done"
                    ? "text-emerald-600"
                    : s.status === "active"
                      ? "text-amber-700 animate-pulse"
                      : s.status === "error"
                        ? "text-red-600"
                        : "text-stone-300";
                const pct =
                  s.total > 0 ? Math.round((s.current / s.total) * 100) : 0;

                return (
                  <div key={stage}>
                    <div className="flex items-baseline gap-3 mb-1">
                      <span
                        className={`flex items-center justify-center w-4 h-4 shrink-0 ${iconColor}`}
                        aria-hidden="true"
                      >
                        {icon}
                      </span>
                      <span className="flex-1 text-sm font-medium text-ink">
                        {STAGE_LABELS[stage]}
                        <span className="sr-only">
                          {s.status === "done" ? " — done" : s.status === "active" ? " — in progress" : s.status === "error" ? " — failed" : " — waiting"}
                        </span>
                      </span>
                      {s.status === "active" && s.total > 1 && (
                        <span className="text-xs text-amber-600">
                          {s.current} / {s.total}
                        </span>
                      )}
                    </div>
                    {(s.status === "active" || s.status === "done") &&
                      s.total > 0 && (
                        <div className="ml-7 h-1 bg-amber-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-150 ${
                              s.status === "done"
                                ? "bg-emerald-500"
                                : "bg-amber-500"
                            }`}
                            style={{
                              width: `${s.status === "done" ? 100 : pct}%`,
                            }}
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

          {/* Translation cost confirmation panel — shown after import completes */}
          {showTranslatePrompt && (
            <div className="border border-amber-200 rounded-xl p-5 mb-4 bg-amber-50/50">
              <p className="text-sm font-semibold text-ink mb-1">
                Pre-translate this book?
              </p>
              <p className="text-xs text-stone-500 mb-3">
                {chapterCount} chapters
                {totalWords ? ` · ~${fmtNum(totalWords)} words` : ""}
                {" · target: "}
                <span className="font-medium text-ink">{tl}</span>
              </p>

              <div className="space-y-2 mb-4">
                {/* Primary option — Gemini */}
                <div className="rounded-lg bg-white border border-amber-200 px-3 py-2.5 text-xs">
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className="font-semibold text-ink">Gemini Flash</span>
                    <span className="font-semibold text-amber-700">{fmtCost(cost.usd)}</span>
                  </div>
                  <p className="text-stone-400">
                    ~{fmtNum(cost.tokens)} output tokens · $2.50/M on paid tier.{" "}
                    <span className="text-emerald-600 font-medium">Free on free tier.</span>
                    {" Runs in background."}
                  </p>
                </div>
                {/* Secondary option — Google Translate */}
                <div className="rounded-lg bg-stone-50 border border-stone-200 px-3 py-2 text-xs text-stone-500">
                  <span className="font-medium text-stone-600">Google Translate</span>
                  {" — always free, lower quality. Available chapter-by-chapter in the reader sidebar."}
                </div>
              </div>

              {translateError && (
                <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{translateError}</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleTranslate}
                  disabled={translateState === "pending"}
                  className="flex-1 rounded-lg bg-amber-700 text-white min-h-[44px] text-xs font-medium hover:bg-amber-800 disabled:opacity-50 flex items-center justify-center"
                >
                  {translateState === "pending"
                    ? "Enqueuing…"
                    : "Translate in background"}
                </button>
                <button
                  onClick={() => setTranslateState("skipped")}
                  className="rounded-lg border border-stone-300 text-stone-600 px-3 min-h-[44px] text-xs hover:bg-stone-50 flex items-center"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {translateState === "enqueued" && (
            <p className="text-xs text-emerald-700 mb-3">
              Translation queued — you can read now while it runs in the
              background.
            </p>
          )}

          {loginRequired && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center mb-4">
              <p className="font-serif text-base font-semibold text-ink mb-1">Login required</p>
              <p className="text-sm text-amber-800 mb-4">
                Sign in to read this book.
              </p>
              <a
                href="/api/auth/signin"
                className="inline-flex items-center rounded-lg bg-amber-700 text-white px-5 min-h-[44px] text-sm font-medium hover:bg-amber-800"
              >
                Sign in
              </a>
            </div>
          )}

          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">
              {error}
            </div>
          )}

          {readyToRedirect && (
            <p className="text-sm text-emerald-700 mb-4">
              Done — opening your book…
            </p>
          )}

          {started && !readyToRedirect && (
            <div className="flex gap-2">
              {canStartReading && !showTranslatePrompt && (
                <button
                  onClick={skipToReading}
                  className="flex-1 rounded-lg bg-amber-700 text-white min-h-[44px] text-sm font-medium hover:bg-amber-800 flex items-center justify-center"
                >
                  Start reading now
                </button>
              )}
              <button
                onClick={cancel}
                className="rounded-lg border border-stone-300 text-stone-600 px-4 min-h-[44px] text-sm hover:bg-stone-50 flex items-center"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-stone-400 mt-4">
          Translations are cached — other readers of the same book share the
          result.
        </p>
      </div>
    </main>
  );
}

"use client";
import { useRef, useState } from "react";
import { seedPopularStream, SeedPopularEvent } from "@/lib/api";

interface Props {
  onComplete?: () => void;   // called when the job finishes so parent can re-fetch books list
}

export default function SeedPopularButton({ onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(0);
  const [alreadyCached, setAlreadyCached] = useState(0);
  const [downloaded, setDownloaded] = useState(0);
  const [failed, setFailed] = useState(0);
  const [currentTitle, setCurrentTitle] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function start() {
    if (running) return;
    if (!confirm(
      "Download every popular book listed in popular_books.json into the DB.\n\n" +
      "This hits Gutenberg for each uncached book (~1 second each). " +
      "Safe to run — books already cached are skipped. Can take 5-15 minutes."
    )) return;

    setRunning(true);
    setExpanded(true);
    setDone(false);
    setError("");
    setTotal(0);
    setCurrent(0);
    setDownloaded(0);
    setFailed(0);
    setAlreadyCached(0);
    setCurrentTitle("");

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      for await (const ev of seedPopularStream(abort.signal)) {
        handleEvent(ev);
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setRunning(false);
    }
  }

  function handleEvent(ev: SeedPopularEvent) {
    if (ev.event === "error") {
      setError(ev.message || "Seed failed");
      return;
    }
    if (ev.event === "start") {
      setTotal(ev.to_download || 0);
      setAlreadyCached(ev.already_cached || 0);
      return;
    }
    if (ev.event === "progress") {
      setCurrent(ev.current || 0);
      setCurrentTitle(ev.title || "");
      if (ev.status === "done") {
        setDownloaded((d) => d + 1);
      } else if (ev.status === "failed") {
        setFailed((f) => f + 1);
      }
      return;
    }
    if (ev.event === "done") {
      setDone(true);
      setDownloaded(ev.downloaded || 0);
      setFailed(ev.failed || 0);
      onComplete?.();
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setRunning(false);
  }

  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

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
        {expanded && !running && (
          <button
            onClick={() => { setExpanded(false); setError(""); }}
            className="text-xs text-stone-500 hover:text-stone-700"
          >
            Hide
          </button>
        )}
      </div>

      {expanded && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 text-sm space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="font-medium text-ink">Seed popular books</span>
            {running && (
              <button
                onClick={cancel}
                className="text-xs text-red-600 hover:text-red-800"
              >
                Stop
              </button>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded px-2 py-1 text-xs">
              {error}
            </div>
          )}

          {total === 0 && !error && !done && (
            <p className="text-xs text-stone-500">Planning…</p>
          )}

          {total > 0 && (
            <>
              <div className="flex items-baseline justify-between text-xs text-stone-600">
                <span>{current} / {total} processed{alreadyCached ? ` · ${alreadyCached} already cached` : ""}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-600 transition-all duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {currentTitle && running && (
                <p className="text-xs text-amber-700 truncate">
                  ↓ {currentTitle}
                </p>
              )}
            </>
          )}

          {done && (
            <div className="text-xs">
              <p className="text-emerald-700 font-medium">
                Done · downloaded {downloaded}
                {alreadyCached ? ` · already cached ${alreadyCached}` : ""}
                {failed ? ` · failed ${failed}` : ""}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

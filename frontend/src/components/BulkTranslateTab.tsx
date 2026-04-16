"use client";
import { useEffect, useRef, useState } from "react";

type FetchFn = (path: string, options?: RequestInit) => Promise<any>;

interface BookPlanItem {
  id: number;
  title: string;
  source_language: string;
  chapters_to_translate: number;
}

interface PlanResult {
  total_books: number;
  total_chapters: number;
  total_batches: number;
  total_words: number;
  estimated_minutes_at_rpm: number;
  estimated_days_at_rpd: number;
  books: BookPlanItem[];
}

interface JobState {
  id: number;
  status: string;
  target_language: string;
  provider: string;
  model: string;
  dry_run: boolean;
  total_chapters: number;
  completed_chapters: number;
  failed_chapters: number;
  skipped_chapters: number;
  requests_made: number;
  current_book_id: number | null;
  current_book_title: string;
  current_chapter_index: number | null;
  last_error: string;
  started_at: string | null;
  ended_at: string | null;
}

interface StatusResp {
  running: boolean;
  state: JobState | null;
  preview: Record<string, string[]> | null;
}

interface HistoryItem {
  id: number;
  status: string;
  target_language: string;
  provider: string;
  model: string;
  dry_run: boolean;
  total_chapters: number;
  completed_chapters: number;
  failed_chapters: number;
  started_at: string | null;
  ended_at: string | null;
}

const LANGUAGES = [
  { code: "zh", label: "Chinese (zh)" },
  { code: "en", label: "English (en)" },
  { code: "de", label: "German (de)" },
  { code: "fr", label: "French (fr)" },
  { code: "es", label: "Spanish (es)" },
  { code: "ja", label: "Japanese (ja)" },
];

export default function BulkTranslateTab({ adminFetch }: { adminFetch: FetchFn }) {
  const [targetLang, setTargetLang] = useState("zh");
  const [rpm, setRpm] = useState(12);
  const [rpd, setRpd] = useState(1400);

  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [planning, setPlanning] = useState(false);

  const [status, setStatus] = useState<StatusResp | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refreshStatus() {
    try {
      const [s, h] = await Promise.all([
        adminFetch("/admin/bulk-translate/status") as Promise<StatusResp>,
        adminFetch("/admin/bulk-translate/history") as Promise<HistoryItem[]>,
      ]);
      setStatus(s);
      setHistory(h);
    } catch (e: unknown) {
      // Polling errors shouldn't spam the console — swallow
    }
  }

  // Initial load + poll every 3s
  useEffect(() => {
    refreshStatus();
    pollRef.current = setInterval(refreshStatus, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPlan() {
    setPlanning(true);
    setError("");
    try {
      const result = await adminFetch("/admin/bulk-translate/plan", {
        method: "POST",
        body: JSON.stringify({ target_language: targetLang, rpm, rpd }),
      });
      setPlan(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Plan failed");
    } finally {
      setPlanning(false);
    }
  }

  async function startJob(dryRun: boolean) {
    if (!confirm(
      dryRun
        ? `Dry run: translate the first batch only (no DB writes) so you can preview quality. Continue?`
        : `Start real bulk translation into ${targetLang}? This can take hours or days at the free-tier rate limit.`
    )) return;

    setStarting(true);
    setError("");
    try {
      await adminFetch("/admin/bulk-translate/start", {
        method: "POST",
        body: JSON.stringify({
          target_language: targetLang, rpm, rpd, dry_run: dryRun,
        }),
      });
      await refreshStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Start failed");
    } finally {
      setStarting(false);
    }
  }

  async function stopJob() {
    if (!confirm("Stop the running translation job?")) return;
    try {
      await adminFetch("/admin/bulk-translate/stop", { method: "POST" });
      await refreshStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Stop failed");
    }
  }

  const state = status?.state;
  const running = status?.running ?? false;
  const progressPct = state && state.total_chapters > 0
    ? Math.round((state.completed_chapters / state.total_chapters) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── Live status card ────────────────────────────────────────── */}
      <section className="bg-white border border-amber-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif font-semibold text-ink text-base">Status</h2>
          {state && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              running ? "bg-emerald-100 text-emerald-700" :
              state.status === "completed" ? "bg-amber-100 text-amber-700" :
              state.status === "paused" ? "bg-orange-100 text-orange-700" :
              "bg-stone-100 text-stone-600"
            }`}>
              {running ? "Running" : state.status}
            </span>
          )}
        </div>

        {!state && (
          <p className="text-sm text-stone-500">No bulk translation jobs yet.</p>
        )}

        {state && (
          <>
            <div className="text-xs text-stone-500 mb-2">
              #{state.id} · {state.target_language} · {state.provider} · {state.dry_run && "(dry run)"}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Stat label="Completed" value={`${state.completed_chapters} / ${state.total_chapters}`} />
              <Stat label="Requests" value={state.requests_made} />
              <Stat label="Failed" value={state.failed_chapters} highlight={state.failed_chapters > 0} />
              <Stat label="Progress" value={`${progressPct}%`} />
            </div>

            {state.total_chapters > 0 && (
              <div className="h-2 bg-amber-100 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-amber-600 transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}

            {running && state.current_book_title && (
              <p className="text-xs text-amber-700 mb-2">
                Now translating <span className="font-medium">&ldquo;{state.current_book_title}&rdquo;</span>
                {state.current_chapter_index !== null && (
                  <span> · chapter {state.current_chapter_index + 1}</span>
                )}
              </p>
            )}

            {state.last_error && (
              <p className="text-xs text-red-600 font-mono whitespace-pre-wrap mt-2 bg-red-50 rounded px-2 py-1">
                {state.last_error}
              </p>
            )}

            {state.dry_run && status?.preview && (
              <div className="mt-4 border-t border-amber-100 pt-4">
                <h3 className="text-sm font-medium text-ink mb-2">Dry-run preview (first batch)</h3>
                <div className="space-y-3 max-h-64 overflow-y-auto bg-amber-50/50 rounded-lg p-3">
                  {Object.entries(status.preview).map(([idx, paragraphs]) => (
                    <div key={idx} className="text-sm font-serif">
                      <div className="text-xs text-amber-600 mb-1">Chapter {Number(idx) + 1}</div>
                      {paragraphs.map((p, i) => (
                        <p key={i} className="mb-1 text-ink">{p}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              {running && (
                <button
                  onClick={stopJob}
                  className="text-sm px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50"
                >
                  Stop
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Controls ────────────────────────────────────────────────── */}
      <section className="bg-white border border-amber-200 rounded-xl p-5">
        <h2 className="font-serif font-semibold text-ink text-base mb-4">Start a new job</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs text-stone-600 mb-1">Target language</label>
            <select
              value={targetLang}
              onChange={(e) => { setTargetLang(e.target.value); setPlan(null); }}
              className="w-full rounded border border-amber-300 px-2 py-1.5 text-sm bg-white"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-stone-600 mb-1">RPM limit</label>
            <input
              type="number" min="1" max="60" value={rpm}
              onChange={(e) => setRpm(Number(e.target.value))}
              className="w-full rounded border border-amber-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-600 mb-1">RPD limit</label>
            <input
              type="number" min="1" max="10000" value={rpd}
              onChange={(e) => setRpd(Number(e.target.value))}
              className="w-full rounded border border-amber-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={runPlan}
            disabled={planning || running}
            className="text-sm px-4 py-1.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40"
          >
            {planning ? "Planning…" : "Show plan"}
          </button>
          <button
            onClick={() => startJob(true)}
            disabled={starting || running}
            className="text-sm px-4 py-1.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40"
          >
            Dry run (preview quality)
          </button>
          <button
            onClick={() => startJob(false)}
            disabled={starting || running}
            className="text-sm px-4 py-1.5 rounded bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-40"
          >
            Start real run
          </button>
        </div>

        {plan && (
          <div className="border-t border-amber-100 pt-4">
            <h3 className="text-sm font-medium text-ink mb-2">Plan</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <Stat label="Books" value={plan.total_books} />
              <Stat label="Chapters" value={plan.total_chapters} />
              <Stat label="Batches (≈ req)" value={plan.total_batches} />
              <Stat label="Words" value={plan.total_words.toLocaleString()} />
            </div>
            <p className="text-xs text-stone-500 mb-3">
              Estimated <strong>{plan.estimated_minutes_at_rpm} min</strong> at {rpm} RPM
              {" · "}
              <strong>{plan.estimated_days_at_rpd} days</strong> at {rpd} RPD
            </p>
            {plan.books.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-amber-100 rounded">
                <table className="w-full text-xs">
                  <thead className="bg-amber-50">
                    <tr>
                      <th className="text-left px-2 py-1 text-stone-600">Book</th>
                      <th className="text-left px-2 py-1 text-stone-600">Lang</th>
                      <th className="text-right px-2 py-1 text-stone-600">Chapters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.books.map((b) => (
                      <tr key={b.id} className="border-t border-amber-50">
                        <td className="px-2 py-1 text-ink">{b.title}</td>
                        <td className="px-2 py-1 text-stone-500">{b.source_language}</td>
                        <td className="px-2 py-1 text-right text-stone-600">{b.chapters_to_translate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── History ─────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <section className="bg-white border border-amber-200 rounded-xl p-5">
          <h2 className="font-serif font-semibold text-ink text-base mb-3">Recent runs</h2>
          <table className="w-full text-xs">
            <thead className="text-stone-600">
              <tr>
                <th className="text-left py-1">#</th>
                <th className="text-left py-1">Status</th>
                <th className="text-left py-1">Lang</th>
                <th className="text-right py-1">Done</th>
                <th className="text-right py-1">Failed</th>
                <th className="text-left py-1">Started</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-amber-50">
                  <td className="py-1 text-stone-500">{h.id}</td>
                  <td className="py-1">{h.status}{h.dry_run && " (dry)"}</td>
                  <td className="py-1">{h.target_language}</td>
                  <td className="py-1 text-right">{h.completed_chapters}/{h.total_chapters}</td>
                  <td className="py-1 text-right text-red-500">{h.failed_chapters || ""}</td>
                  <td className="py-1 text-stone-400">
                    {h.started_at ? new Date(h.started_at).toLocaleString() : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? "bg-red-50 border border-red-200" : "bg-amber-50/50 border border-amber-100"}`}>
      <div className={`text-lg font-bold ${highlight ? "text-red-700" : "text-ink"}`}>{value}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  );
}

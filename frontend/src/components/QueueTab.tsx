"use client";
import { useEffect, useRef, useState } from "react";
import {
  GEMINI_MODEL_OPTIONS,
  DEFAULT_CHAIN,
  labelForModel,
  isRecommended,
  rateForModel,
} from "@/lib/geminiModels";

type AdminFetch = (path: string, options?: RequestInit) => Promise<any>;

interface QueueSettings {
  enabled: boolean;
  has_api_key: boolean;
  auto_translate_languages: string[];
  rpm: number | null;
  rpd: number | null;
  model: string | null;
  model_chain: string[];
  max_output_tokens: number | null;
}

interface WorkerLog {
  event: string;
  at: string;
  book_id?: number;
  title?: string;
  lang?: string;
  chapter?: number;
  error?: string;
}

interface WorkerState {
  enabled: boolean;
  idle: boolean;
  current_book_id: number | null;
  current_book_title: string;
  current_target_language: string;
  current_batch_size: number;
  current_model?: string;
  last_completed_at: string | null;
  last_error: string;
  started_at: string | null;
  requests_made: number;
  chapters_done: number;
  chapters_failed: number;
  waiting_reason: string;
  retry_attempt?: number;
  retry_max?: number;
  retry_delay_seconds?: number;
  retry_next_at?: string | null;
  retry_reason?: string;
  log: WorkerLog[];
}

interface QueueStatus {
  running: boolean;
  state: WorkerState;
  counts: Record<string, number>;
}

interface CostEstimate {
  pending_items: number;
  pending_books: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  per_model: { model: string; usd: number }[];
}

interface QueueItem {
  id: number;
  book_id: number;
  book_title: string | null;
  chapter_index: number;
  target_language: string;
  status: string;
  priority: number;
  attempts: number;
  last_error: string | null;
  created_at: string;
  queued_by: string | null;
}

interface Props {
  adminFetch: AdminFetch;
}

// SQLite returns "YYYY-MM-DD HH:MM:SS" in UTC. Render as a compact relative
// age (e.g. "3m ago", "2h ago") — admins scan rows fastest that way.
function relTime(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z");
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 5) return "now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

export default function QueueTab({ adminFetch }: Props) {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [settings, setSettings] = useState<QueueSettings | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [cost, setCost] = useState<CostEstimate | null>(null);
  const [itemFilter, setItemFilter] = useState<"pending" | "running" | "failed" | "all">("pending");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form state — mirrors settings but editable.
  const [langs, setLangs] = useState("");
  const [apiKey, setApiKey] = useState("");
  // Ordered chain of models. The worker tries each in order, advancing
  // to the next on 429 / quota. Empty slot = not used.
  const [chain, setChain] = useState<string[]>(DEFAULT_CHAIN);
  const [customModel, setCustomModel] = useState("");
  // Track once we've initialised from server so the user's edits
  // aren't overwritten by a later poll.
  const chainInitedRef = useRef(false);

  async function refresh() {
    try {
      const [st, cfg, its, cst] = await Promise.all([
        adminFetch("/admin/queue/status"),
        adminFetch("/admin/queue/settings"),
        adminFetch(
          `/admin/queue/items?limit=100${
            itemFilter === "all" ? "" : `&status=${itemFilter}`
          }`,
        ),
        adminFetch("/admin/queue/cost-estimate"),
      ]);
      setStatus(st);
      setSettings(cfg);
      setItems(its);
      setCost(cst);
      if (langs === "") setLangs((cfg.auto_translate_languages || []).join(", "));
      if (!chainInitedRef.current) {
        const serverChain = (cfg as QueueSettings).model_chain;
        setChain(
          Array.isArray(serverChain) && serverChain.length > 0
            ? serverChain
            : cfg.model
              ? [cfg.model]
              : DEFAULT_CHAIN,
        );
        chainInitedRef.current = true;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load queue");
    }
  }

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemFilter]);

  async function saveSettings(patch: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      await adminFetch("/admin/queue/settings", {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function startWorker() {
    await adminFetch("/admin/queue/start", { method: "POST" });
    await refresh();
  }

  async function stopWorker() {
    if (!confirm("Stop the translation queue worker? Pending items stay in the queue.")) return;
    await adminFetch("/admin/queue/stop", { method: "POST" });
    await refresh();
  }

  async function enqueueAll() {
    if (!confirm("Queue EVERY cached book for translation into all configured languages?")) return;
    try {
      const res = await adminFetch("/admin/queue/enqueue-all", { method: "POST" });
      alert(`Enqueued ${res.enqueued} chapter(s) across ${res.books_scanned} book(s).`);
      await refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  async function retry(item: QueueItem) {
    await adminFetch(`/admin/queue/items/${item.id}/retry`, { method: "POST" });
    await refresh();
  }

  async function remove(item: QueueItem) {
    if (!confirm(`Remove queue item #${item.id}?`)) return;
    await adminFetch(`/admin/queue/items/${item.id}`, { method: "DELETE" });
    await refresh();
  }

  async function clearAll() {
    const scope = itemFilter === "all" ? "ALL" : itemFilter;
    if (!confirm(`Delete ${scope} queue items? This is irreversible (but you can re-enqueue via the Books tab).`)) return;
    try {
      const path = itemFilter === "all"
        ? "/admin/queue"
        : `/admin/queue?status=${itemFilter}`;
      const res = await adminFetch(path, { method: "DELETE" });
      alert(`Deleted ${res.deleted} queue item(s).`);
      await refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Clear failed");
    }
  }

  const s = status?.state;
  const counts = status?.counts || {};
  const totalPending = counts.pending || 0;
  const totalDone = counts.done || 0;
  const totalFailed = counts.failed || 0;
  const totalRunning = counts.running || 0;

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Worker status */}
      <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              status?.running
                ? s?.idle
                  ? "bg-amber-400"
                  : "bg-emerald-500 animate-pulse"
                : "bg-stone-300"
            }`}
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-ink">
              {status?.running
                ? s?.idle
                  ? `Idle — ${s.waiting_reason || "nothing to do"}`
                  : `Translating ${s?.current_book_title || "…"} → ${s?.current_target_language}${
                      s?.current_model ? ` · via ${s.current_model}` : ""
                    }`
                : "Worker stopped"}
            </div>
            <div className="text-xs text-stone-500">
              {totalPending} pending · {totalRunning} running · {totalDone} done · {totalFailed} failed
              {s?.requests_made !== undefined && ` · ${s.requests_made} API calls this session`}
            </div>
          </div>
          {status?.running ? (
            <button
              onClick={stopWorker}
              className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={startWorker}
              className="text-xs px-3 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              Start
            </button>
          )}
        </div>

        {/* Retry banner — amber, appears while the worker is backing off
            between attempts. Shows the upcoming attempt number + error so
            the admin knows this is transient, not a hard failure. */}
        {s?.retry_attempt && s.retry_attempt > 0 && s.retry_max ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <div className="font-medium">
              Retrying · attempt {s.retry_attempt}/{s.retry_max}
              {s.retry_delay_seconds && s.retry_delay_seconds > 0
                ? ` · backing off ${Math.round(s.retry_delay_seconds)}s`
                : ""}
            </div>
            {s.retry_reason && (
              <div className="text-amber-600 truncate">{s.retry_reason}</div>
            )}
          </div>
        ) : null}

        {/* Hard error — only shown once retries are exhausted. */}
        {s?.last_error && !(s.retry_attempt && s.retry_attempt > 0) && (
          <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1 truncate">
            Last error: {s.last_error}
          </div>
        )}

        {s?.log && s.log.length > 0 && (
          <details>
            <summary className="text-xs text-amber-700 cursor-pointer">
              Activity log ({s.log.length})
            </summary>
            <ul className="mt-1 text-xs space-y-0.5 max-h-40 overflow-y-auto">
              {s.log
                .slice()
                .reverse()
                .map((e, i) => (
                  <li
                    key={i}
                    className={`font-mono truncate ${
                      e.event.includes("error") || e.event === "tick_error"
                        ? "text-red-600"
                        : "text-stone-600"
                    }`}
                  >
                    {e.event === "translated" ? "✓" : "!"} {e.event}
                    {e.title ? ` · ${e.title}` : ""}
                    {e.chapter !== undefined ? ` · ch${e.chapter}` : ""}
                    {e.lang ? ` → ${e.lang}` : ""}
                    {e.error ? ` — ${e.error}` : ""}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </div>

      {/* Settings */}
      <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-ink">Service settings</h3>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-stone-600">Enabled</span>
            <input
              type="checkbox"
              checked={settings?.enabled ?? false}
              disabled={saving}
              onChange={(e) => saveSettings({ enabled: e.target.checked })}
            />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-stone-600">
              Auto-translate languages (comma-separated, e.g. <code>zh, de, ja</code>)
            </label>
            <div className="flex gap-2">
              <input
                value={langs}
                onChange={(e) => setLangs(e.target.value)}
                className="flex-1 rounded border border-amber-300 px-2 py-1 text-sm"
                placeholder="zh, de, ja"
              />
              <button
                onClick={() =>
                  saveSettings({
                    auto_translate_languages: langs
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
                disabled={saving}
                className="text-xs px-3 py-1 rounded bg-amber-700 text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-stone-600">
              Gemini API key {settings?.has_api_key && <span className="text-emerald-600">· configured</span>}
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="flex-1 rounded border border-amber-300 px-2 py-1 text-sm"
                placeholder={settings?.has_api_key ? "•••• (leave empty to keep)" : "Paste key"}
              />
              <button
                onClick={() => {
                  if (!apiKey) return;
                  saveSettings({ api_key: apiKey });
                  setApiKey("");
                }}
                disabled={saving || !apiKey}
                className="text-xs px-3 py-1 rounded bg-amber-700 text-white disabled:opacity-50"
              >
                Save
              </button>
              {settings?.has_api_key && (
                <button
                  onClick={() => {
                    if (confirm("Clear queue API key?")) saveSettings({ api_key: "" });
                  }}
                  className="text-xs px-2 py-1 rounded border border-red-200 text-red-500"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-stone-600">
                Model chain — tried in order. On 429/quota the worker falls to the next.
              </label>
              <button
                onClick={() => {
                  // Save chain; primary's rate limits become the active
                  // ones for legacy fields so bulk-translate etc. see them.
                  const primary = chain[0] ?? "";
                  const { rpm, rpd, maxOutputTokens } = rateForModel(primary);
                  saveSettings({
                    model_chain: chain,
                    model: primary,
                    rpm,
                    rpd,
                    max_output_tokens: maxOutputTokens,
                  });
                }}
                disabled={saving || chain.length === 0}
                className="text-xs px-3 py-0.5 rounded bg-amber-700 text-white disabled:opacity-50"
              >
                Save chain
              </button>
            </div>

            {/* Live summary — show the configured chain and what the
                worker is actually using at the moment. */}
            <div className="text-[11px] text-stone-500 leading-relaxed">
              Active chain:{" "}
              {(settings?.model_chain ?? [])
                .map((m, i) => `${i + 1}. ${labelForModel(m)}`)
                .join("  →  ") || <em>not saved yet</em>}
              {s?.current_model ? (
                <div>
                  Currently using:{" "}
                  <span className="font-mono text-emerald-700">{s.current_model}</span>
                </div>
              ) : null}
            </div>

            {/* Configured chain — reorder / remove */}
            <div className="mt-2 space-y-1.5">
              {chain.map((m, idx) => {
                const opt = GEMINI_MODEL_OPTIONS.find((o) => o.value === m);
                const recommended = isRecommended(m);
                return (
                  <div
                    key={`${m}-${idx}`}
                    className={`flex items-start gap-2 p-2 rounded-lg border ${
                      idx === 0
                        ? "border-amber-400 bg-amber-50"
                        : "border-amber-200 bg-white"
                    }`}
                  >
                    <div className="text-xs text-stone-500 font-mono w-6 shrink-0 pt-0.5">
                      {idx + 1}.
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink font-mono">
                          {labelForModel(m)}
                        </span>
                        {!recommended && (
                          <span
                            className="text-[10px] px-1 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200"
                            title="Drops literary nuance — use only as a last-resort fallback"
                          >
                            not recommended for literature
                          </span>
                        )}
                        {opt ? (
                          <span className="text-[11px] text-stone-500">
                            {opt.rpm} rpm · {opt.rpd} rpd · ≤
                            {opt.maxOutputTokens.toLocaleString()} tok
                          </span>
                        ) : (
                          <span className="text-[11px] text-stone-400">
                            custom — conservative defaults
                          </span>
                        )}
                      </div>
                      {opt?.note && (
                        <div className="text-xs text-stone-500 mt-0.5">{opt.note}</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => {
                          if (idx === 0) return;
                          const copy = [...chain];
                          [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
                          setChain(copy);
                        }}
                        disabled={idx === 0}
                        className="text-xs px-1 text-stone-500 hover:text-amber-700 disabled:opacity-30"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => {
                          if (idx === chain.length - 1) return;
                          const copy = [...chain];
                          [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
                          setChain(copy);
                        }}
                        disabled={idx === chain.length - 1}
                        className="text-xs px-1 text-stone-500 hover:text-amber-700 disabled:opacity-30"
                        title="Move down"
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      onClick={() => setChain(chain.filter((_, i) => i !== idx))}
                      className="text-xs px-1.5 rounded border border-red-200 text-red-500 shrink-0 self-start"
                      title="Remove from chain"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              {chain.length === 0 && (
                <div className="text-xs text-stone-400 italic">
                  Chain is empty — add a model below.
                </div>
              )}
            </div>

            {/* Add to chain — recommended first, then not-recommended */}
            <div className="mt-3">
              <div className="text-xs text-stone-600 mb-1">Add to chain:</div>
              <div className="flex flex-wrap gap-1.5">
                {GEMINI_MODEL_OPTIONS
                  .filter((o) => !chain.includes(o.value))
                  .map((opt) => (
                    <button
                      key={opt.value || "default"}
                      onClick={() => setChain([...chain, opt.value])}
                      className={`text-xs px-2 py-1 rounded border font-mono ${
                        opt.recommended
                          ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          : "border-stone-200 text-stone-500 hover:bg-stone-50"
                      }`}
                      title={opt.note}
                    >
                      + {opt.label}
                      {!opt.recommended && (
                        <span className="ml-1 text-[10px] text-orange-600">
                          (not recommended)
                        </span>
                      )}
                    </button>
                  ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="Custom model (e.g. gemini-exp-1206)"
                  className="flex-1 rounded border border-amber-300 px-2 py-1 text-xs font-mono"
                />
                <button
                  onClick={() => {
                    if (!customModel.trim() || chain.includes(customModel.trim())) return;
                    setChain([...chain, customModel.trim()]);
                    setCustomModel("");
                  }}
                  disabled={!customModel.trim()}
                  className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 disabled:opacity-40"
                >
                  + Add custom
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t border-amber-100">
          <button
            onClick={enqueueAll}
            className="text-xs px-3 py-1.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            Queue every book for all configured languages
          </button>
        </div>
      </div>

      {/* Cost analysis — back-of-envelope estimate of draining the pending queue
          across each model. Helps decide whether to route through pro vs flash. */}
      {cost && cost.pending_items > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="font-medium text-ink">Cost estimate (to drain queue)</h3>
            <span className="text-[11px] text-stone-500">
              {cost.pending_items} pending across {cost.pending_books} book
              {cost.pending_books === 1 ? "" : "s"} ·{" "}
              ~{(cost.estimated_input_tokens / 1_000_000).toFixed(1)}M in /{" "}
              ~{(cost.estimated_output_tokens / 1_000_000).toFixed(1)}M out tokens
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {cost.per_model.map((row) => (
              <div
                key={row.model}
                className="rounded-lg border border-amber-100 p-2 text-center"
              >
                <div className="text-[11px] text-stone-500 font-mono truncate">
                  {row.model}
                </div>
                <div className="text-sm font-semibold text-ink">
                  ${row.usd.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-stone-400">
            Rough estimate — assumes ~3 chars/token and 1:1 input-to-output ratio.
            Actual cost depends on tokenizer, chapter lengths, and batching.
            Chain advance on 429 means multiple models may contribute.
          </p>
        </div>
      )}

      {/* Queue items */}
      <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
        <div className="px-4 py-2 border-b border-amber-100 flex items-center gap-2 text-sm">
          <span className="font-medium">Items</span>
          {(["pending", "running", "failed", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setItemFilter(f)}
              className={`text-xs px-2 py-0.5 rounded ${
                itemFilter === f ? "bg-amber-700 text-white" : "text-amber-700 hover:bg-amber-50"
              }`}
            >
              {f}
            </button>
          ))}
          <span className="ml-auto text-xs text-stone-500">{items.length} shown</span>
          <button
            onClick={clearAll}
            disabled={items.length === 0}
            className="text-xs px-2 py-0.5 rounded border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40"
            title={itemFilter === "all" ? "Clear entire queue" : `Clear all ${itemFilter}`}
          >
            {itemFilter === "all" ? "Clear queue" : `Clear ${itemFilter}`}
          </button>
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-stone-400 text-sm">
            No items in this view.
          </div>
        ) : (
          <ul className="divide-y divide-amber-50 max-h-96 overflow-y-auto">
            {items.map((it) => (
              <li key={it.id} className="px-4 py-2 flex items-center gap-2 text-xs">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 ${
                    it.status === "pending"
                      ? "bg-stone-100 text-stone-600"
                      : it.status === "running"
                        ? "bg-emerald-100 text-emerald-700"
                        : it.status === "done"
                          ? "bg-amber-100 text-amber-700"
                          : it.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {it.status}
                </span>
                <span
                  className="text-ink truncate max-w-[40%]"
                  title={it.book_title || `book ${it.book_id}`}
                >
                  {it.book_title || `book ${it.book_id}`}
                </span>
                <span className="text-stone-500 font-mono shrink-0">
                  · ch {it.chapter_index + 1} → {it.target_language}
                </span>
                <span
                  className="text-stone-400 shrink-0"
                  title={`Queued ${it.created_at} by ${it.queued_by || "auto (save_book)"}`}
                >
                  · {relTime(it.created_at)}
                  {" by "}
                  <span className={it.queued_by ? "text-stone-500" : "italic"}>
                    {it.queued_by || "auto"}
                  </span>
                </span>
                {it.attempts > 0 && (
                  <span className="text-stone-400 shrink-0">· {it.attempts} attempts</span>
                )}
                {it.last_error && (
                  <span
                    className="text-red-500 truncate flex-1 min-w-0"
                    title={it.last_error}
                  >
                    {it.last_error}
                  </span>
                )}
                <div className="ml-auto flex gap-1 shrink-0">
                  {it.status === "failed" && (
                    <button
                      onClick={() => retry(it)}
                      className="px-1.5 py-0.5 rounded border border-amber-300 text-amber-700"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    onClick={() => remove(it)}
                    className="px-1.5 py-0.5 rounded border border-red-200 text-red-500"
                  >
                    Del
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

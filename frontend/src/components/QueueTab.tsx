"use client";
import { useEffect, useRef, useState } from "react";
import {
  CHAIN_PRESETS,
  DEFAULT_CHAIN,
  GEMINI_MODEL_OPTIONS,
  isRecommended,
  labelForModel,
  presetMatchingChain,
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

// Small inline spinner — used next to section headers so a long-running
// fetch spins just that panel rather than freezing the whole tab.
function Spinner({ size = 12 }: { size?: number }) {
  return (
    <span
      className="inline-block border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin align-middle"
      style={{ width: size, height: size }}
      aria-label="loading"
    />
  );
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
  // Flashes "Saved ✓" briefly after any successful setting save so the admin
  // sees confirmation instead of wondering whether their click did anything.
  // Maps a label ("chain", "api_key", etc.) → timestamp of last save.
  const [lastSaved, setLastSaved] = useState<{ key: string; at: number } | null>(null);
  const [itemFilter, setItemFilter] = useState<"pending" | "running" | "failed" | "all">("pending");
  // Ref mirrors itemFilter so the long-lived poll interval (set up once
  // with empty deps) reads the current filter on every tick instead of
  // the initial "pending" captured in its closure.
  const itemFilterRef = useRef(itemFilter);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Per-section loading flags so a slow fetch spins only its own panel
  // instead of freezing the whole tab. Each is set true at the start of
  // the corresponding fetch and false on completion (success or error).
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingCost, setLoadingCost] = useState(false);
  // Track whether the first load has completed — subsequent polls keep
  // prior data visible, but the very first render needs a clear loading
  // indicator so the panels don't pop in one-by-one looking broken.
  const [initialLoaded, setInitialLoaded] = useState(false);
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

  // Split the previously-monolithic refresh so each panel reacts to the
  // change that actually affects it. Before this, clicking a filter pill
  // waited on the slowest fetch (cost-estimate, which can take seconds on
  // a 4K-row queue) before the items list updated — felt laggy.
  async function refreshCore() {
    // Status + settings + (cost) — re-fetched on a 3s tick.
    try {
      const [st, cfg] = await Promise.all([
        adminFetch("/admin/queue/status"),
        adminFetch("/admin/queue/settings"),
      ]);
      setStatus(st);
      setSettings(cfg);
      setInitialLoaded(true);
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

  async function refreshItems(
    filter: string = itemFilter,
    opts: { silent?: boolean } = {},
  ) {
    // The 3s background poll passes silent:true so the spinner doesn't
    // flicker every few seconds. Initial load + user-initiated filter
    // changes pass silent:false so the user gets visible feedback.
    if (!opts.silent) setLoadingItems(true);
    try {
      const its = await adminFetch(
        `/admin/queue/items?limit=100${
          filter === "all" ? "" : `&status=${filter}`
        }`,
      );
      setItems(its);
      setInitialLoaded(true);
    } catch {
      /* leave existing items visible if this poll fails */
    } finally {
      if (!opts.silent) setLoadingItems(false);
    }
  }

  async function refreshCost() {
    // Cost estimate is the slowest endpoint (scans the queue + books
    // text-length). Poll at a lazier cadence so it doesn't drag the
    // other panels or block the tab from reacting to user clicks.
    setLoadingCost(true);
    try {
      const cst = await adminFetch("/admin/queue/cost-estimate");
      setCost(cst);
    } catch {
      /* best-effort */
    } finally {
      setLoadingCost(false);
    }
  }

  // Single entry point for places that previously called refresh() —
  // kicks all three in parallel without waiting.
  function refresh() {
    refreshCore();
    refreshItems();
    refreshCost();
  }

  useEffect(() => {
    refreshCore();
    refreshItems(); // initial items load — spinner visible
    refreshCost();
    // Core (status/settings) + items poll every 3s. Items polls are
    // SILENT so the spinner doesn't flicker every few seconds (which
    // made the filter pills shift around). Read the filter via ref so
    // the interval sees user changes instead of its stale initial
    // closure — without this the poll overwrote the selected filter
    // back to "pending" every 3s.
    const fastPoll = setInterval(() => {
      refreshCore();
      refreshItems(itemFilterRef.current, { silent: true });
    }, 3000);
    // Cost is heavier — poll on a 30s cadence to avoid blocking the UI.
    const slowPoll = setInterval(refreshCost, 30000);
    return () => {
      clearInterval(fastPoll);
      clearInterval(slowPoll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter pills: keep the ref in sync AND fire a fresh items fetch.
  useEffect(() => {
    itemFilterRef.current = itemFilter;
    if (!chainInitedRef.current) return; // initial load handles it
    refreshItems(itemFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemFilter]);

  async function saveSettings(
    patch: Record<string, unknown>,
    label: string = "settings",
  ) {
    setSaving(true);
    setError("");
    try {
      await adminFetch("/admin/queue/settings", {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      setLastSaved({ key: label, at: Date.now() });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
      return;
    }
    // Re-enable the button immediately — the PUT already succeeded.
    // Waiting for refresh() makes the UI feel laggy when the post-save
    // poll is hitting the slow cost-estimate endpoint.
    setSaving(false);
    // Fire-and-forget refresh so the "Active chain" display picks up the
    // new saved state on the next tick.
    refreshCore();
  }

  function wasJustSaved(label: string): boolean {
    return (
      lastSaved?.key === label && Date.now() - lastSaved.at < 3000
    );
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

  // First load hasn't completed yet — show a skeleton instead of the half-
  // rendered panels that used to pop in incrementally over a few seconds.
  if (!initialLoaded && !error) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="bg-white rounded-xl border border-amber-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-stone-300" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-48 bg-stone-200 rounded" />
              <div className="h-2 w-64 bg-stone-100 rounded" />
            </div>
            <div className="h-6 w-16 bg-stone-100 rounded" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
          <div className="h-3 w-32 bg-stone-200 rounded" />
          <div className="h-8 bg-stone-100 rounded" />
          <div className="h-8 bg-stone-100 rounded" />
          <div className="grid grid-cols-3 gap-2">
            <div className="h-16 bg-stone-100 rounded" />
            <div className="h-16 bg-stone-100 rounded" />
            <div className="h-16 bg-stone-100 rounded" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-2">
          <div className="h-3 w-24 bg-stone-200 rounded" />
          <div className="h-4 w-full bg-stone-100 rounded" />
          <div className="h-4 w-3/4 bg-stone-100 rounded" />
          <div className="h-4 w-5/6 bg-stone-100 rounded" />
        </div>
        <div className="text-center text-xs text-stone-400">
          Loading queue…
        </div>
      </div>
    );
  }

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
            <ul className="mt-1 text-xs space-y-1 max-h-60 overflow-y-auto">
              {s.log
                .slice()
                .reverse()
                .map((e, i) => (
                  <li
                    key={i}
                    className={`font-mono break-words whitespace-pre-wrap leading-snug ${
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
              <div className="flex items-center gap-2">
                {wasJustSaved("chain") && (
                  <span className="text-xs text-emerald-700">Saved ✓</span>
                )}
                <button
                  onClick={() => {
                    // Save chain; primary's rate limits become the active
                    // ones for legacy fields so bulk-translate etc. see them.
                    const primary = chain[0] ?? "";
                    const { rpm, rpd, maxOutputTokens } = rateForModel(primary);
                    saveSettings(
                      {
                        model_chain: chain,
                        model: primary,
                        rpm,
                        rpd,
                        max_output_tokens: maxOutputTokens,
                      },
                      "chain",
                    );
                  }}
                  disabled={saving || chain.length === 0}
                  className="text-xs px-3 py-0.5 rounded bg-amber-700 text-white disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {saving && (
                    <span
                      className="inline-block border-2 border-white/60 border-t-white rounded-full animate-spin"
                      style={{ width: 10, height: 10 }}
                      aria-label="saving"
                    />
                  )}
                  {saving ? "Saving…" : "Save chain"}
                </button>
              </div>
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

            {/* Preset strip — one-click chains that map admin intent to a
                concrete model ordering. Clicking applies to form state;
                admin still saves explicitly via "Save chain". */}
            <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/30 p-2">
              <div className="text-xs text-stone-600 mb-1">
                Quick presets (click to load a chain):
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                {CHAIN_PRESETS.map((p) => {
                  const active = presetMatchingChain(chain) === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setChain([...p.chain])}
                      className={`text-left p-2 rounded-lg border transition-colors ${
                        active
                          ? "border-amber-500 bg-amber-100/60"
                          : "border-amber-200 bg-white hover:bg-amber-50"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-ink">
                          {p.label}
                        </span>
                        {active && (
                          <span className="text-[10px] text-amber-700">selected</span>
                        )}
                      </div>
                      <div className="text-[11px] text-amber-700">{p.tagline}</div>
                      <div className="text-[11px] text-stone-500 mt-1 leading-snug">
                        {p.description}
                      </div>
                      <div className="text-[10px] font-mono text-stone-400 mt-1 truncate">
                        {p.chain.join(" → ")}
                      </div>
                    </button>
                  );
                })}
              </div>
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
          across each model. Helps decide whether to route through pro vs flash.
          Shows its own spinner (not full-tab) because this is the slowest fetch. */}
      {loadingCost && !cost && (
        <div className="bg-white rounded-xl border border-amber-200 p-4 flex items-center gap-2 text-sm text-stone-500">
          <Spinner />
          Computing cost estimate…
        </div>
      )}
      {cost && cost.pending_items > 0 && (() => {
        const books = Math.max(1, cost.pending_books);
        // Map the model rows by name so we can highlight what's in the
        // configured chain vs. the full comparison grid.
        const byModel: Record<string, number> = Object.fromEntries(
          cost.per_model.map((r) => [r.model, r.usd]),
        );
        // The saved active chain (what the worker is actually going to use).
        const activeChain = settings?.model_chain ?? [];
        return (
          <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h3 className="font-medium text-ink flex items-center gap-2">
                Cost estimate (to drain queue)
                {loadingCost && <Spinner />}
              </h3>
              <span className="text-[11px] text-stone-500">
                {cost.pending_items} pending across {cost.pending_books} book
                {cost.pending_books === 1 ? "" : "s"} ·{" "}
                ~{(cost.estimated_input_tokens / 1_000_000).toFixed(1)}M in /{" "}
                ~{(cost.estimated_output_tokens / 1_000_000).toFixed(1)}M out tokens
              </span>
            </div>

            {/* Chain-aware view: if the active chain's primary stays in
                quota, this is the expected bill. Followed by per-book so
                admins can reason about cost to translate one more title. */}
            {activeChain.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="text-[11px] text-emerald-700 font-medium mb-1">
                  Active chain · {activeChain.map(labelForModel).join(" → ")}
                </div>
                <div className="flex flex-wrap gap-4 items-baseline">
                  <div>
                    <div className="text-[10px] text-stone-500">if primary handles all</div>
                    <div className="text-lg font-semibold text-emerald-800">
                      ${(
                        byModel[activeChain[0]] ??
                        byModel[activeChain[0] || ""] ??
                        0
                      ).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-stone-500">per book (avg)</div>
                    <div className="text-lg font-semibold text-emerald-800">
                      ${(
                        (byModel[activeChain[0]] ??
                          byModel[activeChain[0] || ""] ??
                          0) / books
                      ).toFixed(2)}
                    </div>
                  </div>
                  {activeChain.length > 1 && (
                    <div>
                      <div className="text-[10px] text-stone-500">
                        fallback min · {labelForModel(activeChain[activeChain.length - 1])}
                      </div>
                      <div className="text-lg font-semibold text-emerald-800">
                        ${(
                          byModel[activeChain[activeChain.length - 1]] ?? 0
                        ).toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Grid: all models, with total + per-book so admins can
                compare any alternative to their current chain. */}
            <div>
              <div className="text-[11px] text-stone-500 mb-1">
                All models — total / per-book
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {cost.per_model.map((row) => {
                  const inChain = activeChain.includes(row.model)
                    || (row.model === "default" && activeChain.includes(""));
                  return (
                    <div
                      key={row.model}
                      className={`rounded-lg border p-2 text-center ${
                        inChain
                          ? "border-emerald-300 bg-emerald-50/40"
                          : "border-amber-100"
                      }`}
                    >
                      <div className="text-[11px] text-stone-500 font-mono truncate">
                        {row.model}
                      </div>
                      <div className="text-sm font-semibold text-ink">
                        ${row.usd.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-stone-400">
                        ${(row.usd / books).toFixed(3)}/book
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[11px] text-stone-400">
              Rough estimate — assumes ~3 chars/token and 1:1 input-to-output ratio.
              Actual cost depends on tokenizer, chapter lengths, and batching.
              Chain advance on 429/quota means multiple models may contribute — the
              &quot;fallback min&quot; shows the floor if every batch runs on the cheapest
              chain member.
            </p>
          </div>
        );
      })()}

      {/* Queue items */}
      <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
        <div className="px-4 py-2 border-b border-amber-100 flex items-center gap-2 text-sm">
          {/* Spinner slot has fixed width even when empty so the header
              doesn't reflow and shift the filter pills. */}
          <span className="font-medium flex items-center gap-1.5">
            Items
            <span className="inline-block w-3 h-3 align-middle">
              {loadingItems && <Spinner />}
            </span>
          </span>
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
          <div className="px-4 py-8 text-center text-stone-400 text-sm flex items-center justify-center gap-2">
            {loadingItems && <Spinner />}
            <span>{loadingItems ? "Loading items…" : "No items in this view."}</span>
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

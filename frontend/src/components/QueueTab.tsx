"use client";
import { useEffect, useRef, useState } from "react";
import { GEMINI_MODEL_OPTIONS } from "@/lib/geminiModels";

type AdminFetch = (path: string, options?: RequestInit) => Promise<any>;

interface QueueSettings {
  enabled: boolean;
  has_api_key: boolean;
  auto_translate_languages: string[];
  rpm: number | null;
  rpd: number | null;
  model: string | null;
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

interface QueueItem {
  id: number;
  book_id: number;
  chapter_index: number;
  target_language: string;
  status: string;
  priority: number;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

interface Props {
  adminFetch: AdminFetch;
}

export default function QueueTab({ adminFetch }: Props) {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [settings, setSettings] = useState<QueueSettings | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [itemFilter, setItemFilter] = useState<"pending" | "running" | "failed" | "all">("pending");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form state — mirrors settings but editable.
  const [langs, setLangs] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [rpm, setRpm] = useState("");
  const [rpd, setRpd] = useState("");
  const [model, setModel] = useState("");

  async function refresh() {
    try {
      const [st, cfg, its] = await Promise.all([
        adminFetch("/admin/queue/status"),
        adminFetch("/admin/queue/settings"),
        adminFetch(
          `/admin/queue/items?limit=100${
            itemFilter === "all" ? "" : `&status=${itemFilter}`
          }`,
        ),
      ]);
      setStatus(st);
      setSettings(cfg);
      setItems(its);
      if (langs === "") setLangs((cfg.auto_translate_languages || []).join(", "));
      if (rpm === "" && cfg.rpm) setRpm(String(cfg.rpm));
      if (rpd === "" && cfg.rpd) setRpd(String(cfg.rpd));
      if (model === "" && cfg.model) setModel(cfg.model);
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
                  : `Translating ${s?.current_book_title || "…"} → ${s?.current_target_language}`
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

          <div className="space-y-1">
            <label className="text-xs text-stone-600">RPM</label>
            <div className="flex gap-2">
              <input
                value={rpm}
                onChange={(e) => setRpm(e.target.value)}
                className="flex-1 rounded border border-amber-300 px-2 py-1 text-sm"
                placeholder="12"
              />
              <button
                onClick={() => saveSettings({ rpm: Number(rpm) || 12 })}
                disabled={saving}
                className="text-xs px-3 py-1 rounded bg-amber-700 text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-stone-600">RPD (per-day cap)</label>
            <div className="flex gap-2">
              <input
                value={rpd}
                onChange={(e) => setRpd(e.target.value)}
                className="flex-1 rounded border border-amber-300 px-2 py-1 text-sm"
                placeholder="1400"
              />
              <button
                onClick={() => saveSettings({ rpd: Number(rpd) || 1400 })}
                disabled={saving}
                className="text-xs px-3 py-1 rounded bg-amber-700 text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-stone-600">Model</label>
              <button
                onClick={() => saveSettings({ model })}
                disabled={saving}
                className="text-xs px-3 py-0.5 rounded bg-amber-700 text-white disabled:opacity-50"
              >
                Save model
              </button>
            </div>
            <div className="space-y-1.5">
              {GEMINI_MODEL_OPTIONS.map((opt) => (
                <label
                  key={opt.value || "default"}
                  className={`flex items-start gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                    model === opt.value
                      ? "border-amber-400 bg-amber-50"
                      : "border-amber-200 bg-white hover:bg-amber-50/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="queue-model"
                    value={opt.value}
                    checked={model === opt.value}
                    onChange={() => setModel(opt.value)}
                    className="mt-0.5 accent-amber-700"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink font-mono">
                      {opt.label}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">{opt.note}</div>
                  </div>
                </label>
              ))}
              <label className="flex items-start gap-3 p-2 rounded-lg border border-amber-200 bg-white">
                <input
                  type="radio"
                  name="queue-model"
                  checked={
                    !!model && !GEMINI_MODEL_OPTIONS.some((o) => o.value === model)
                  }
                  onChange={() => setModel("gemini-2.5-flash")}
                  className="mt-0.5 accent-amber-700"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-ink mb-1">Custom</div>
                  <input
                    type="text"
                    value={
                      GEMINI_MODEL_OPTIONS.some((o) => o.value === model) ? "" : model
                    }
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. gemini-exp-1206"
                    className="w-full rounded border border-amber-300 px-2 py-1 text-sm bg-white font-mono"
                  />
                  <p className="text-[11px] text-stone-500 mt-1">
                    Anything the API accepts. If you see 404, the model isn&apos;t available for your key.
                  </p>
                </div>
              </label>
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
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
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
                <span className="text-stone-600 font-mono">
                  book {it.book_id} · ch {it.chapter_index} → {it.target_language}
                </span>
                {it.attempts > 0 && (
                  <span className="text-stone-400">· {it.attempts} attempts</span>
                )}
                {it.last_error && (
                  <span className="text-red-500 truncate flex-1" title={it.last_error}>
                    {it.last_error}
                  </span>
                )}
                <div className="ml-auto flex gap-1">
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

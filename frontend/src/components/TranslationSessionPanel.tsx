"use client";
import { useState } from "react";
import {
  TranslationSession,
  SessionProvider,
  createTranslationSession,
  updateTranslationSession,
  deleteTranslationSession,
} from "@/lib/api";
import { LANGUAGES } from "@/components/InsightChat";
import { TrashIcon, EditIcon } from "@/components/Icons";

interface Props {
  bookId: number;
  bookLanguage: string;
  sessions: TranslationSession[];
  /** null = Editorial */
  activeSessionId: number | null;
  chapterCount: number;
  chapterIndex: number;
  hasClaudeKey: boolean;
  hasDeepseekKey: boolean;
  onSelect: (session: TranslationSession | null) => void;
  onSessionsChanged: (sessions: TranslationSession[]) => void;
  onTranslateChapter: () => void;
  translating: boolean;
  /** Persistent error from the last session action (translate/delete). */
  actionError?: string | null;
  onDismissError?: () => void;
  /** Live background-run progress; the translate button becomes a bar. */
  runProgress?: { done: number; total: number } | null;
  /** paragraphs translated / total in the current chapter (session view) */
  chapterProgress?: { done: number; total: number } | null;
}

export default function TranslationSessionPanel({
  bookId,
  bookLanguage,
  sessions,
  activeSessionId,
  chapterCount,
  chapterIndex,
  hasClaudeKey,
  hasDeepseekKey,
  onSelect,
  onSessionsChanged,
  onTranslateChapter,
  translating,
  actionError,
  onDismissError,
  runProgress,
  chapterProgress,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [lang, setLang] = useState(() => LANGUAGES.find((l) => l.code !== bookLanguage)?.code ?? "en");
  const [provider, setProvider] = useState<SessionProvider>(hasDeepseekKey || !hasClaudeKey ? "deepseek" : "claude");
  const [style, setStyle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const active = sessions.find((s) => s.id === activeSessionId) ?? null;
  const providerReady = provider === "deepseek" ? hasDeepseekKey : hasClaudeKey;

  async function handleCreate() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createTranslationSession({
        book_id: bookId,
        name: name.trim(),
        target_language: lang,
        provider,
        ...(style.trim() ? { style_prompt: style.trim() } : {}),
      });
      onSessionsChanged([...sessions, created]);
      onSelect(created);
      setCreating(false);
      setName("");
      setStyle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the session.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(session: TranslationSession) {
    if (busy || !renameValue.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateTranslationSession(session.id, { name: renameValue.trim() });
      onSessionsChanged(sessions.map((s) => (s.id === session.id ? { ...s, ...updated, coverage: s.coverage } : s)));
      setRenamingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename the session.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(session: TranslationSession) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTranslationSession(session.id);
      onSessionsChanged(sessions.filter((s) => s.id !== session.id));
      if (activeSessionId === session.id) onSelect(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the session.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStyleSave(value: string) {
    if (!active) return;
    try {
      const updated = await updateTranslationSession(active.id, { style_prompt: value });
      onSessionsChanged(sessions.map((s) => (s.id === active.id ? { ...s, ...updated, coverage: s.coverage } : s)));
    } catch {
      setError("Could not save the style prompt.");
    }
  }

  async function handleProviderSave(value: SessionProvider) {
    if (!active) return;
    try {
      const updated = await updateTranslationSession(active.id, { provider: value });
      onSessionsChanged(sessions.map((s) => (s.id === active.id ? { ...s, ...updated, coverage: s.coverage } : s)));
    } catch {
      setError("Could not change the provider.");
    }
  }

  const chaptersCovered = active
    ? Object.keys(active.coverage ?? {}).length
    : 0;

  return (
    <div className="mb-4" data-testid="translation-session-panel">
      <p className="block text-xs text-amber-700 mb-1">Translation sessions</p>
      <div className="space-y-1.5" role="radiogroup" aria-label="Translation sessions">
        <button
          role="radio"
          aria-checked={activeSessionId === null}
          onClick={() => onSelect(null)}
          className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 min-h-[44px] md:min-h-0 text-sm text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
            activeSessionId === null ? "border-amber-600 ring-1 ring-amber-600 bg-white" : "border-amber-200 bg-white hover:bg-amber-50"
          }`}
        >
          <span className="font-medium text-ink flex-1">Editorial</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">queue</span>
        </button>

        {sessions.map((s) => (
          <div key={s.id} className={`rounded-lg border transition-colors ${
            activeSessionId === s.id ? "border-amber-600 ring-1 ring-amber-600 bg-white" : "border-amber-200 bg-white"
          }`}>
            {renamingId === s.id ? (
              <div className="p-2 space-y-1.5">
                <input
                  aria-label="Session name"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={() => handleRename(s)} className="text-xs px-2.5 py-1 min-h-[44px] md:min-h-0 rounded bg-amber-700 text-white hover:bg-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">Save</button>
                  <button onClick={() => setRenamingId(null)} className="text-xs px-2 py-1 min-h-[44px] md:min-h-0 text-stone-600 hover:text-stone-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-2">
                <button
                  role="radio"
                  aria-checked={activeSessionId === s.id}
                  onClick={() => onSelect(s)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
                >
                  <span lang={s.target_language} className="font-medium text-ink text-sm truncate">{s.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 shrink-0">{s.target_language}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 shrink-0 font-mono">{s.provider}</span>
                </button>
                <button
                  onClick={() => { setRenamingId(s.id); setRenameValue(s.name); }}
                  aria-label={`Rename session ${s.name}`}
                  className="shrink-0 p-1 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center text-stone-600 hover:text-stone-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <EditIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(s)}
                  aria-label={`Delete session ${s.name}`}
                  className="shrink-0 p-1 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center text-red-500 hover:text-red-600 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}

        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="text-sm text-amber-700 hover:text-amber-800 hover:underline min-h-[44px] md:min-h-0 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
          >
            ＋ New session…
          </button>
        ) : (
          <div className="rounded-lg border border-amber-300 bg-white p-3 space-y-2" data-testid="new-session-form">
            <input
              aria-label="Session name"
              placeholder="Session name (e.g. 诗意版)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
              autoFocus
            />
            <select
              aria-label="Session target language"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {LANGUAGES.filter((l) => l.code !== bookLanguage).map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <select
              aria-label="Session provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as SessionProvider)}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="deepseek" disabled={!hasDeepseekKey}>DeepSeek · deepseek-v4-flash{hasDeepseekKey ? "" : " (no key)"}</option>
              <option value="claude" disabled={!hasClaudeKey}>Claude · claude-sonnet-5{hasClaudeKey ? "" : " (no key)"}</option>
            </select>
            <textarea
              aria-label="Style and requirements"
              placeholder="Style & requirements (optional) — e.g. 优雅的书面语，保留诗行结构"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              rows={2}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={busy || !name.trim() || !providerReady}
                className="text-xs px-3 py-1.5 min-h-[44px] md:min-h-0 rounded bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                Create session
              </button>
              <button onClick={() => { setCreating(false); setError(null); }} className="text-xs px-2 py-1.5 min-h-[44px] md:min-h-0 text-stone-600 hover:text-stone-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">Cancel</button>
            </div>
            {!providerReady && (
              <p className="text-[11px] text-amber-700">Add a {provider === "deepseek" ? "DeepSeek" : "Claude"} API key in your profile to use this provider.</p>
            )}
          </div>
        )}
      </div>

      {/* Active session: style panel + chapter translate */}
      {active && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3 space-y-2" data-testid="session-style-panel">
          <label htmlFor="session-style" className="block text-[11px] font-medium text-amber-700 uppercase tracking-wide">Style &amp; requirements</label>
          <textarea
            id="session-style"
            defaultValue={active.style_prompt ?? ""}
            onBlur={(e) => { if (e.target.value !== (active.style_prompt ?? "")) handleStyleSave(e.target.value); }}
            rows={3}
            className="w-full text-sm border border-amber-200 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <select
            aria-label="Session provider"
            value={active.provider}
            onChange={(e) => handleProviderSave(e.target.value as SessionProvider)}
            className="w-full text-sm border border-amber-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="deepseek" disabled={!hasDeepseekKey}>DeepSeek · deepseek-v4-flash{hasDeepseekKey ? "" : " (no key)"}</option>
            <option value="claude" disabled={!hasClaudeKey}>Claude · claude-sonnet-5{hasClaudeKey ? "" : " (no key)"}</option>
          </select>
          {actionError && (
            <div role="alert" data-testid="session-action-error" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start justify-between gap-2">
              <span className="flex-1">{actionError}</span>
              {onDismissError && (
                <button onClick={onDismissError} aria-label="Dismiss error" className="shrink-0 font-bold text-red-400 hover:text-red-600 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded">×</button>
              )}
            </div>
          )}
          <button
            onClick={onTranslateChapter}
            disabled={translating}
            aria-busy={translating}
            data-testid="translate-chapter-button"
            className="relative w-full px-3 py-2 min-h-[44px] md:min-h-0 rounded-lg overflow-hidden bg-amber-700 hover:bg-amber-800 disabled:hover:bg-amber-700 text-white text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
          >
            {/* The button IS the progress bar during a run */}
            {runProgress && runProgress.total > 0 && (
              <span
                aria-hidden="true"
                data-testid="translate-progress-fill"
                className="absolute inset-y-0 left-0 bg-amber-500/80 transition-all duration-500"
                style={{ width: `${Math.round((runProgress.done / runProgress.total) * 100)}%` }}
              />
            )}
            <span className="relative">
              {runProgress && runProgress.total > 0
                ? `Translating ${runProgress.done} / ${runProgress.total}…`
                : translating ? "Translating…" : "Translate this chapter"}
            </span>
          </button>
          <p className="text-[11px] text-stone-600" data-testid="session-coverage">
            {chapterProgress ? `${chapterProgress.done} / ${chapterProgress.total} paragraphs in this chapter · ` : ""}
            {chaptersCovered} / {chapterCount} chapters started
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

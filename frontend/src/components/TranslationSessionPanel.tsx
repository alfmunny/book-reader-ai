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
import { getSettings } from "@/lib/settings";
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
  onTranslateChapter: (force?: boolean) => void;
  /** Characters of the current chapter's source text — drives the rough
   *  token/cost estimate in the retranslate confirmation. */
  chapterChars?: number;
  translating: boolean;
  /** Persistent error from the last session action (translate/delete). */
  actionError?: string | null;
  onDismissError?: () => void;
  /** Live background-run progress; the translate button becomes a bar. */
  runProgress?: { done: number; total: number } | null;
  /** Editorial coverage for the Editorial entry's status (read-only). */
  editorialStatus?: { lang: string; done: number; total: number; thisChapter: boolean; loading: boolean } | null;
  /** All languages that have editorial translations, with coverage. */
  editorialLanguages?: { total: number; languages: Array<{ code: string; chapters: number }> } | null;
  translationLang?: string;
  onChangeLanguage?: (lang: string) => void;
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
  chapterChars = 0,
  translating,
  actionError,
  onDismissError,
  runProgress,
  editorialStatus,
  editorialLanguages,
  translationLang,
  onChangeLanguage,
  chapterProgress,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [lang, setLang] = useState(() => LANGUAGES.find((l) => l.code !== bookLanguage)?.code ?? "en");
  const [provider, setProvider] = useState<SessionProvider>(() => {
    // Profile default first, when its key exists; else whichever key is saved.
    const preferred = getSettings().versionProviderDefault ?? "deepseek";
    const keyFor = { deepseek: hasDeepseekKey, claude: hasClaudeKey };
    if (keyFor[preferred]) return preferred;
    return hasDeepseekKey || !hasClaudeKey ? "deepseek" : "claude";
  });
  const [style, setStyle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmRetranslate, setConfirmRetranslate] = useState(false);
  // Version-list filter (owner request, 2026-08-27): by name, language, model.
  const [filterText, setFilterText] = useState("");
  const [filterLang, setFilterLang] = useState("all");
  const [filterProvider, setFilterProvider] = useState("all");

  const active = sessions.find((s) => s.id === activeSessionId) ?? null;

  const showFilter = sessions.length > 3;
  const sessionLangs = Array.from(new Set(sessions.map((s) => s.target_language)));
  const visibleSessions = sessions.filter((s) => {
    // The active version stays visible regardless of filters — hiding the
    // thing currently rendered in the reader would be disorienting.
    if (s.id === activeSessionId) return true;
    if (filterText && !s.name.toLowerCase().includes(filterText.trim().toLowerCase())) return false;
    if (filterLang !== "all" && s.target_language !== filterLang) return false;
    if (filterProvider !== "all" && s.provider !== filterProvider) return false;
    return true;
  });
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
      setError(e instanceof Error ? e.message : "Could not create the version.");
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
      setError(e instanceof Error ? e.message : "Could not rename the version.");
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
      setError(e instanceof Error ? e.message : "Could not delete the version.");
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

  async function handleLanguageSave(value: string) {
    if (!active) return;
    try {
      const updated = await updateTranslationSession(active.id, { target_language: value });
      const merged = { ...active, ...updated, coverage: active.coverage };
      onSessionsChanged(sessions.map((s) => (s.id === active.id ? merged : s)));
      // Reselect so the reader picks up the new language immediately
      onSelect(merged);
    } catch {
      setError("Could not change the language.");
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

  const chapterComplete = !!chapterProgress && chapterProgress.total > 0 && chapterProgress.done >= chapterProgress.total;
  const chapterPartial = !!chapterProgress && chapterProgress.done > 0 && chapterProgress.done < chapterProgress.total;

  // Rough, transparent estimate: input ≈ chars/4 tokens, output about the
  // same. Marked as approximate in the dialog — the point is awareness, not
  // accounting (owner, 2026-08-27: "make the user aware this costs money").
  const estTokens = Math.max(1, Math.round((chapterChars / 4) * 2));
  const price = active?.provider === "claude"
    ? { name: "claude-sonnet-5", cost: (chapterChars / 4) * 3e-6 + (chapterChars / 4) * 15e-6 }
    : { name: "deepseek-v4-flash", cost: (chapterChars / 4) * 0.22e-6 + (chapterChars / 4) * 0.66e-6 };
  const estCost = price.cost < 0.01 ? "< $0.01" : `≈ $${price.cost.toFixed(2)}`;

  return (
    <div className="mb-4" data-testid="translation-session-panel">
      <p className="block text-xs text-amber-700 mb-1">Editorial translation</p>
      <div className={`rounded-lg border mb-3 ${activeSessionId === null ? "border-amber-600 ring-1 ring-amber-600 bg-white" : "border-amber-200 bg-white"}`} data-testid="editorial-card">
        <button
          role="radio"
          aria-checked={activeSessionId === null}
          onClick={() => onSelect(null)}
          className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] md:min-h-0 text-sm text-left transition-colors hover:bg-amber-50/50 rounded-t-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <span className="font-medium text-ink flex-1">Editorial</span>
          {editorialStatus && !editorialStatus.loading && (
            <span
              data-testid="editorial-chip-status"
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${editorialStatus.thisChapter ? "bg-green-50 text-green-700" : "bg-stone-100 text-stone-500"}`}
              title={`${editorialStatus.done} / ${editorialStatus.total} chapters have an editorial translation`}
            >
              {editorialStatus.thisChapter ? `✓ ${editorialStatus.done}/${editorialStatus.total} ch` : `– ${editorialStatus.done}/${editorialStatus.total} ch`}
            </span>
          )}
        </button>
        <div className="px-3 pb-2.5" data-testid="editorial-languages">
          {/* Coverage lives IN the options (owner, 2026-08-27): every language
              is pickable, and "0/28 ch" right in the dropdown explains an
              empty editorial view before it happens. */}
          <label htmlFor="reader-trans-lang" className="block text-[11px] text-stone-500 mb-1">Target language</label>
          <select
            id="reader-trans-lang"
            className="w-full text-sm rounded-lg border border-amber-300 px-3 py-2 text-ink bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            value={translationLang}
            onChange={(e) => onChangeLanguage?.(e.target.value)}
          >
            {LANGUAGES.filter((l) => l.code !== bookLanguage).map((l) => {
              const covered = editorialLanguages?.languages.find((x) => x.code === l.code)?.chapters ?? 0;
              const suffix = editorialLanguages ? ` — ${covered}/${editorialLanguages.total} ch` : "";
              return (
                <option key={l.code} value={l.code}>{l.label}{suffix}</option>
              );
            })}
          </select>
          <p className="mt-1 text-[11px] text-stone-500">For this book only — numbers show chapters with an editorial translation.</p>
          {editorialLanguages && editorialLanguages.languages.length === 0 && (
            <p className="mt-1 text-[11px] text-stone-500 italic">None yet — editorial translations are prepared offline.</p>
          )}
        </div>
      </div>

      <p className="block text-xs text-amber-700 mb-1">Other translation versions</p>
      {showFilter && (
        <div className="mb-2 space-y-1.5" data-testid="version-filter">
          <input
            aria-label="Filter versions by name"
            placeholder="Filter by name…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full text-xs border border-amber-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex gap-1.5">
            <select
              aria-label="Filter versions by language"
              value={filterLang}
              onChange={(e) => setFilterLang(e.target.value)}
              className="flex-1 min-w-0 text-xs border border-amber-200 rounded px-1.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="all">All languages</option>
              {sessionLangs.map((l) => (
                <option key={l} value={l}>{LANGUAGES.find((x) => x.code === l)?.label ?? l}</option>
              ))}
            </select>
            <select
              aria-label="Filter versions by model"
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="flex-1 min-w-0 text-xs border border-amber-200 rounded px-1.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="all">All models</option>
              <option value="deepseek">deepseek-v4-flash</option>
              <option value="claude">claude-sonnet-5</option>
            </select>
          </div>
        </div>
      )}
      <div className="space-y-1.5" role="radiogroup" aria-label="Other translation versions">

        {showFilter && visibleSessions.length === 0 && (
          <p className="text-xs text-stone-500 italic px-1" data-testid="no-version-match">No versions match the filter.</p>
        )}
        {visibleSessions.map((s) => (
          <div key={s.id} className={`rounded-lg border transition-colors ${
            activeSessionId === s.id ? "border-amber-600 ring-1 ring-amber-600 bg-white" : "border-amber-200 bg-white"
          }`}>
            {renamingId === s.id ? (
              <div className="p-2 space-y-1.5">
                <input
                  aria-label="Version name"
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
                  aria-label={`Rename version ${s.name}`}
                  className="shrink-0 p-1 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center text-stone-600 hover:text-stone-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <EditIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(s)}
                  aria-label={`Delete version ${s.name}`}
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
            ＋ Add your own version
          </button>
        ) : (
          <div className="rounded-lg border border-amber-300 bg-white p-3 space-y-2" data-testid="new-session-form">
            <input
              aria-label="Version name"
              placeholder="Version name (e.g. 诗意版)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
              autoFocus
            />
            <select
              aria-label="Version target language"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {LANGUAGES.filter((l) => l.code !== bookLanguage).map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <select
              aria-label="Version provider"
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
                Create version
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
          <label className="block text-[11px] font-medium text-amber-700 uppercase tracking-wide" htmlFor="version-lang">Version target language</label>
          <select
            id="version-lang"
            aria-label="Version target language"
            value={active.target_language}
            onChange={(e) => handleLanguageSave(e.target.value)}
            className="w-full text-sm border border-amber-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {LANGUAGES.filter((l) => l.code !== bookLanguage).map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <label htmlFor="session-style" className="block text-[11px] font-medium text-amber-700 uppercase tracking-wide">Style &amp; requirements</label>
          <textarea
            id="session-style"
            defaultValue={active.style_prompt ?? ""}
            onBlur={(e) => { if (e.target.value !== (active.style_prompt ?? "")) handleStyleSave(e.target.value); }}
            rows={3}
            className="w-full text-sm border border-amber-200 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <select
            aria-label="Version provider"
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
            onClick={() => (chapterComplete ? setConfirmRetranslate(true) : onTranslateChapter(false))}
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
                : translating ? "Translating…"
                : chapterComplete ? "Retranslate this chapter"
                : chapterPartial ? `Translate remaining (${chapterProgress!.total - chapterProgress!.done})`
                : "Translate this chapter"}
            </span>
          </button>
          {confirmRetranslate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Confirm retranslation">
              <div className="bg-white rounded-xl border border-amber-200 shadow-xl p-4 w-full max-w-sm space-y-3" data-testid="retranslate-confirm">
                <p className="text-sm font-semibold text-ink">Retranslate this chapter?</p>
                <p className="text-xs text-stone-600 leading-relaxed">
                  This re-runs {price.name} over the whole chapter and <b>costs real tokens</b>:
                  roughly {estTokens.toLocaleString()} tokens, {estCost} on your key (rough estimate).
                  Manually edited paragraphs are kept.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setConfirmRetranslate(false)}
                    className="px-3 py-1.5 min-h-[44px] md:min-h-0 text-sm text-stone-600 hover:text-stone-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setConfirmRetranslate(false); onTranslateChapter(true); }}
                    className="px-4 py-1.5 min-h-[44px] md:min-h-0 text-sm rounded-lg bg-amber-700 text-white hover:bg-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
                  >
                    Retranslate ({estCost})
                  </button>
                </div>
              </div>
            </div>
          )}
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

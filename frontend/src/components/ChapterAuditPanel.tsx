"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { flagsFor, medianLength, paragraphsOf, numberTitles, titlesFromFirstLine, stripLeadingOrdinal } from "@/lib/chapterFlags";
import { CheckCircleIcon, TrashIcon, RetryIcon } from "@/components/Icons";

export interface AuditChapter {
  title: string;
  text: string;
  reviewed: boolean;
}

interface Props {
  chapters: AuditChapter[];
  /** Titles and ticks changed — cheap, debounced, no text. */
  onSaveMeta: (chapters: AuditChapter[]) => Promise<unknown>;
  /** A split or merge moved text between chapters — full replace. */
  onSaveStructure: (chapters: AuditChapter[]) => Promise<unknown>;
  /** Every chapter reviewed and the reader is done. */
  onFinish: (chapters: AuditChapter[]) => Promise<unknown>;
  finishLabel?: string;
  busy?: boolean;
}

const SAVE_DEBOUNCE_MS = 900;

/**
 * Audit a chapter split: find the damage, fix it in place, keep track of how far
 * you got.
 *
 * Nobody reads 47 chapters to check a split, so the rail leads with flags and a
 * review tick rather than with titles. The two operations a bad split actually
 * needs — cut a merged chapter apart, join a chapter that was cut in the middle —
 * live where the eye already is: between the paragraphs.
 *
 * Nothing about this is upload-specific. The owner audits their own upload today;
 * an admin can be handed frozen chapters through the same component.
 */
export default function ChapterAuditPanel({
  chapters, onSaveMeta, onSaveStructure, onFinish, finishLabel = "Add to shelf", busy,
}: Props) {
  const [chs, setChs] = useState<AuditChapter[]>(chapters);
  const [cur, setCur] = useState(0);
  const [undoSnapshot, setUndoSnapshot] = useState<AuditChapter[] | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(chs);
  latest.current = chs;

  useEffect(() => { setChs(chapters); }, [chapters]);
  useEffect(() => () => { if (metaTimer.current) clearTimeout(metaTimer.current); }, []);

  const median = medianLength(chs);
  const current = chs[cur];
  const reviewedCount = chs.filter((c) => c.reviewed).length;
  const flaggedCount = chs.filter((c) => flagsFor(c, median).length > 0).length;
  const allReviewed = chs.length > 0 && reviewedCount === chs.length;

  const runSave = useCallback(async (fn: () => Promise<unknown>) => {
    setSaveState("saving");
    try {
      await fn();
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, []);

  /** Titles and ticks: debounced, so typing does not fire a request per keystroke. */
  const queueMetaSave = useCallback(() => {
    if (metaTimer.current) clearTimeout(metaTimer.current);
    metaTimer.current = setTimeout(() => {
      runSave(() => onSaveMeta(latest.current));
    }, SAVE_DEBOUNCE_MS);
  }, [onSaveMeta, runSave]);

  /** Structure: immediate, and it takes an undo snapshot first. */
  function commitStructure(next: AuditChapter[], nextCur = cur) {
    setUndoSnapshot(chs);
    setChs(next);
    setCur(Math.max(0, Math.min(nextCur, next.length - 1)));
    latest.current = next;
    runSave(() => onSaveStructure(next));
  }

  function setTitle(value: string) {
    const next = chs.map((c, i) => (i === cur ? { ...c, title: value } : c));
    setChs(next);
    latest.current = next;
    queueMetaSave();
  }

  function toggleReviewed() {
    const nowReviewed = !current.reviewed;
    const next = chs.map((c, i) => (i === cur ? { ...c, reviewed: nowReviewed } : c));
    setChs(next);
    latest.current = next;
    queueMetaSave();
    // Marking done moves you on — the audit is a queue, not a browse.
    if (nowReviewed && cur < chs.length - 1) setCur(cur + 1);
  }

  function splitAt(paraIndex: number) {
    const paras = paragraphsOf(current.text);
    const head = paras.slice(0, paraIndex).join("\n\n");
    const tail = paras.slice(paraIndex).join("\n\n");
    const next = [...chs];
    next.splice(cur, 1,
      { ...current, text: head, reviewed: false },
      { title: "", text: tail, reviewed: false },
    );
    commitStructure(next);
  }

  function mergeIntoPrevious() {
    if (cur === 0) return;
    const next = [...chs];
    const [moved] = next.splice(cur, 1);
    const target = next[cur - 1];
    next[cur - 1] = { ...target, text: `${target.text}\n\n${moved.text}`, reviewed: false };
    commitStructure(next, cur - 1);
  }

  function discard() {
    if (chs.length <= 1) return;
    const next = chs.filter((_, i) => i !== cur);
    commitStructure(next, cur);
  }

  function applyTitles(titles: string[]) {
    const next = chs.map((c, i) => ({ ...c, title: titles[i] }));
    setUndoSnapshot(chs);
    setChs(next);
    latest.current = next;
    runSave(() => onSaveMeta(next));
  }

  function undo() {
    if (!undoSnapshot) return;
    const restored = undoSnapshot;
    setUndoSnapshot(null);
    setChs(restored);
    setCur(Math.max(0, Math.min(cur, restored.length - 1)));
    latest.current = restored;
    runSave(() => onSaveStructure(restored));
  }

  const tool = "text-xs px-2.5 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors inline-flex items-center disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1";

  if (!current) {
    return <p className="text-sm text-stone-600 italic">This book has no chapters to review.</p>;
  }

  const currentFlags = flagsFor(current, median);

  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
      {/* Summary before detail: what needs attention, and how far in you are. */}
      <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-amber-100 bg-amber-50/50">
        <span className="text-xs text-stone-600">
          <b className="text-ink font-semibold tabular-nums">{flaggedCount}</b> flagged
        </span>
        <span className="text-xs text-stone-600">
          <b className="text-ink font-semibold tabular-nums">{reviewedCount}</b>/<span className="tabular-nums">{chs.length}</span> reviewed
        </span>
        <span
          role="progressbar"
          aria-label="Review progress"
          aria-valuenow={reviewedCount}
          aria-valuemin={0}
          aria-valuemax={chs.length}
          className="h-1.5 w-24 rounded-full bg-amber-100 overflow-hidden"
        >
          <span className="block h-full bg-amber-700 transition-all duration-200" style={{ width: `${chs.length ? (reviewedCount / chs.length) * 100 : 0}%` }} />
        </span>
        <span className="ml-auto text-xs" role="status" aria-live="polite">
          {saveState === "saving" && <span className="text-stone-600">Saving…</span>}
          {saveState === "saved" && <span className="text-stone-600">Saved</span>}
          {saveState === "error" && <span className="text-red-700">Couldn&apos;t save — your last change is only on this device</span>}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-amber-100 items-center">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-stone-600 mr-1">Titles</span>
        <button className={tool} onClick={() => applyTitles(numberTitles(chs))}>Number them</button>
        <button className={tool} onClick={() => applyTitles(titlesFromFirstLine(chs))}>Use first line</button>
        <button className={tool} onClick={() => applyTitles(chs.map((c) => stripLeadingOrdinal(c.title)))}>Strip numerals</button>
        <button className={tool} onClick={undo} disabled={!undoSnapshot}>
          <RetryIcon className="w-3.5 h-3.5 mr-1" aria-hidden="true" />Undo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
        <nav aria-label="Chapters" className="border-b md:border-b-0 md:border-r border-amber-100 max-h-[240px] md:max-h-[520px] overflow-y-auto">
          <ol className="list-none p-1.5 m-0 space-y-0.5">
            {chs.map((c, i) => {
              const f = flagsFor(c, median);
              return (
                <li key={i}>
                  <button
                    onClick={() => setCur(i)}
                    aria-current={i === cur ? "true" : undefined}
                    aria-label={`Chapter ${i + 1}${c.title ? `: ${c.title}` : ", untitled"}${f.length ? `, ${f.length} flag${f.length > 1 ? "s" : ""}` : ""}${c.reviewed ? ", reviewed" : ""}`}
                    className={`w-full text-left grid grid-cols-[26px_1fr_auto] gap-2 items-start px-2.5 py-2 rounded-lg border transition-colors ${
                      i === cur ? "bg-amber-50 border-amber-300" : "border-transparent hover:bg-amber-50/60"
                    }`}
                  >
                    <span className="text-[11px] text-stone-600 tabular-nums pt-0.5">{i + 1}</span>
                    <span className="min-w-0">
                      {c.title.trim()
                        ? <span className="font-serif text-sm text-ink break-words">{c.title}</span>
                        : <span className="text-xs italic text-red-700">untitled</span>}
                      <span className="block text-[11px] text-stone-600 tabular-nums mt-0.5">
                        {c.text.length.toLocaleString()} chars · {paragraphsOf(c.text).length} ¶
                      </span>
                      {f.length > 0 && (
                        <span className="flex flex-wrap gap-1 mt-1">
                          {f.map((flag) => (
                            <span key={flag.key} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                              {flag.key}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="text-emerald-700 text-sm leading-none pt-0.5" aria-hidden="true">{c.reviewed ? "✓" : ""}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section aria-label="Chapter under review" className="flex flex-col min-w-0">
          <div className="px-4 py-3 border-b border-amber-100">
            <label htmlFor="audit-title" className="text-[11px] font-semibold uppercase tracking-widest text-stone-600">Title</label>
            <input
              id="audit-title"
              value={current.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled chapter"
              className="mt-1 w-full font-serif text-base text-ink bg-white border border-amber-200 rounded-lg px-3 py-2 placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
            />
          </div>

          {currentFlags.length > 0 && (
            <div role="status" className="mx-4 mt-3 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs leading-relaxed">
              {currentFlags.map((f) => (
                <p key={f.key} className="m-0"><b>{f.key}.</b> {f.detail}</p>
              ))}
            </div>
          )}

          <div
            tabIndex={0}
            aria-label="Chapter text"
            className="px-4 py-2 overflow-y-auto max-h-[420px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset rounded"
          >
            {paragraphsOf(current.text).map((para, pi) => (
              <div key={pi}>
                {pi > 0 && (
                  <button
                    onClick={() => splitAt(pi)}
                    aria-label={`Split into a new chapter before paragraph ${pi + 1}`}
                    className="group w-full py-1 flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
                  >
                    <span className="h-px flex-1 bg-amber-300 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" />
                    <span className="text-[10px] uppercase tracking-widest font-bold text-amber-700 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">split here</span>
                    <span className="h-px flex-1 bg-amber-300 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" />
                  </button>
                )}
                <p className="font-serif text-[15px] leading-relaxed text-ink whitespace-pre-line max-w-[64ch] py-1.5 m-0">{para}</p>
              </div>
            ))}
          </div>

          <div className="mt-auto flex flex-wrap gap-2 items-center px-4 py-3 border-t border-amber-100 bg-amber-50/40">
            <button className={tool} onClick={mergeIntoPrevious} disabled={cur === 0}>Merge into previous</button>
            <button className={tool} onClick={discard} disabled={chs.length <= 1}>
              <TrashIcon className="w-3.5 h-3.5 mr-1" aria-hidden="true" />Discard
            </button>
            <button
              onClick={toggleReviewed}
              className="ml-auto text-xs font-medium px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white hover:bg-amber-800 transition-colors inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
            >
              {current.reviewed ? (<><CheckCircleIcon className="w-3.5 h-3.5" aria-hidden="true" />Reviewed</>) : "Mark reviewed"}
            </button>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-amber-100">
        <p className="text-xs text-stone-600 m-0">
          {allReviewed
            ? "Every chapter reviewed. Adding it to your shelf fixes the split so your notes stay put."
            : `${chs.length - reviewedCount} chapter${chs.length - reviewedCount === 1 ? "" : "s"} still to review — you can stop and come back.`}
        </p>
        <button
          onClick={() => onFinish(chs)}
          disabled={busy || !allReviewed}
          title={allReviewed ? undefined : "Review every chapter first"}
          className="ml-auto text-sm font-medium px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white hover:bg-amber-800 transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
        >
          {busy ? "Working…" : finishLabel}
        </button>
      </div>
    </div>
  );
}

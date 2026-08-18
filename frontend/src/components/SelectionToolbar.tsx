"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SpeakerIcon, HighlightIcon, NoteIcon, ChatIcon, WordIcon } from "@/components/Icons";

export interface SelectionAction {
  text: string;
  context: string;
  rect: DOMRect;
}

interface Props {
  onRead?: (text: string) => void;
  onHighlight?: (text: string) => void;
  onNote?: (text: string) => void;
  onChat?: (text: string) => void;
  onVocab?: (word: string, context: string, rect: DOMRect) => void;
}

/** Walk up from a node to find the nearest sentence span (data-seg) or paragraph. */
function extractContext(node: Node | null): string {
  let el: Node | null = node;
  while (el && el !== document.body) {
    if ((el as Element).tagName === "P") return (el as Element).textContent?.trim() ?? "";
    if ((el as Element).hasAttribute?.("data-seg")) return (el as Element).textContent?.trim() ?? "";
    el = el.parentNode;
  }
  return "";
}

export default function SelectionToolbar({ onRead, onHighlight, onNote, onChat, onVocab }: Props) {
  const [selection, setSelection] = useState<SelectionAction | null>(null);
  const [focusedToolbarIdx, setFocusedToolbarIdx] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Track the timestamp of the last pointer event to distinguish mouse vs keyboard selections.
  const lastPointerAt = useRef<number>(0);
  // True while a primary-button pointer drag is extending the selection.
  const isDragging = useRef(false);
  // Save the element that had focus before we moved it to the toolbar.
  const prevFocusRef = useRef<HTMLElement | null>(null);

  function handleToolbarKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const btns = Array.from(toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    if (btns.length === 0) return;
    const cur = btns.indexOf(document.activeElement as HTMLButtonElement);
    const base = cur >= 0 ? cur : focusedToolbarIdx;
    const next = e.key === "ArrowRight"
      ? (base + 1) % btns.length
      : (base - 1 + btns.length) % btns.length;
    setFocusedToolbarIdx(next);
    btns[next].focus();
  }

  const evaluateSelection = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (text.length < 2) {
      setSelection(null);
      return;
    }
    const range = sel?.getRangeAt(0);
    if (!range) return;
    const rect = range.getBoundingClientRect();
    // Only show for selections inside the reader area
    const readerEl = document.getElementById("reader-scroll");
    if (!readerEl?.contains(range.commonAncestorContainer)) return;
    // Don't show toolbar for selections inside translation text
    let node: Node | null = range.commonAncestorContainer;
    while (node && node !== readerEl) {
      if ((node as Element).getAttribute?.("data-translation") === "true") {
        setSelection(null);
        return;
      }
      node = node.parentNode;
    }
    const context = extractContext(range.startContainer);
    setSelection({ text, context, rect });
  }, []);

  // `selectionchange` fires continuously *during* a drag. Showing the toolbar then
  // parks it over the text under the cursor and swallows the pointer events that
  // would extend the selection (#2655), so a drag is evaluated only once it ends.
  // Keyboard selections never set isDragging, so they still resolve here.
  useEffect(() => {
    function handleSelection() {
      if (isDragging.current) return;
      evaluateSelection();
    }

    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, [evaluateSelection]);

  // Track the pointer gesture (capture phase so it runs before selectionchange).
  // The timestamp also feeds the mouse-vs-keyboard heuristic below: stamping it on
  // release too keeps a drag longer than the 300ms threshold classified as a mouse
  // selection, which is what defers the toolbar to pointerup in the first place.
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      lastPointerAt.current = Date.now();
      // Only a primary-button press outside the toolbar starts a text-selection drag.
      if (e.button !== 0 || toolbarRef.current?.contains(e.target as Node)) return;
      isDragging.current = true;
      // Drop any toolbar left over from a previous selection — it would otherwise
      // sit over the text for the whole of this drag.
      setSelection(null);
    }
    function handlePointerEnd() {
      lastPointerAt.current = Date.now();
      if (!isDragging.current) return;
      isDragging.current = false;
      evaluateSelection();
    }
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    document.addEventListener("pointerup", handlePointerEnd, { capture: true });
    document.addEventListener("pointercancel", handlePointerEnd, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      document.removeEventListener("pointerup", handlePointerEnd, { capture: true });
      document.removeEventListener("pointercancel", handlePointerEnd, { capture: true });
    };
  }, [evaluateSelection]);

  // Auto-focus the first toolbar button when a keyboard-driven selection appears.
  // Keyboard selection heuristic: the selection resolves >300ms after the last pointer event.
  // Restore focus to the previously focused element when the toolbar is dismissed.
  // Guard: if the toolbar already contains the focused element (user navigated into it),
  // don't steal focus back — JSDOM can re-fire selectionchange on focus changes, which
  // would re-trigger this effect with a new object reference and reset focus to button[0].
  useEffect(() => {
    if (selection) {
      const isKeyboardSelection = Date.now() - lastPointerAt.current > 300;
      const toolbarAlreadyFocused = toolbarRef.current?.contains(document.activeElement as Node) ?? false;
      if (isKeyboardSelection && !toolbarAlreadyFocused) {
        prevFocusRef.current = document.activeElement as HTMLElement | null;
        const firstBtn = toolbarRef.current?.querySelector<HTMLButtonElement>("button");
        firstBtn?.focus();
      }
    } else {
      if (prevFocusRef.current) {
        prevFocusRef.current.focus();
        prevFocusRef.current = null;
      }
    }
  }, [selection]);

  // Dismiss on Escape key
  useEffect(() => {
    if (!selection) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        window.getSelection()?.removeAllRanges();
        setSelection(null);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selection]);

  // Close when clicking outside or when the reader scrolls
  useEffect(() => {
    if (!selection) return;
    function handleClick(e: MouseEvent) {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      setTimeout(() => {
        const sel = window.getSelection()?.toString().trim() ?? "";
        if (sel.length < 2) setSelection(null);
      }, 100);
    }
    function handleScroll() {
      window.getSelection()?.removeAllRanges();
      setSelection(null);
    }
    document.addEventListener("mousedown", handleClick);
    document.getElementById("reader-scroll")?.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.getElementById("reader-scroll")?.removeEventListener("scroll", handleScroll);
    };
  }, [selection]);

  // Build action list for the screen-reader announcement
  const actionLabels = [
    onRead && "Read",
    onHighlight && "Highlight",
    onNote && "Note",
    onChat && "Chat",
    onVocab && "Look up word",
  ].filter(Boolean).join(", ");

  // Always render a live region so AT can announce when selection activates.
  // When there is no selection, render just the sr-only live region (no visual toolbar).
  if (!selection) {
    return (
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
    );
  }

  const scrollEl = document.getElementById("reader-scroll");
  const scrollRect = scrollEl?.getBoundingClientRect();
  const toolbarWidth = onVocab ? 264 : 220;

  let left = selection.rect.left + selection.rect.width / 2 - toolbarWidth / 2;
  let top = selection.rect.top - 52;

  if (left < 8) left = 8;
  if (left + toolbarWidth > window.innerWidth - 8) left = window.innerWidth - toolbarWidth - 8;
  if (top < (scrollRect?.top ?? 60)) top = selection.rect.bottom + 8;

  function handleAction(fn?: (text: string) => void) {
    if (!fn || !selection) return;
    fn(selection.text);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  function handleVocabAction() {
    if (!onVocab || !selection) return;
    onVocab(selection.text, selection.context || selection.text, selection.rect);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  const btnClass = "flex items-center gap-1.5 px-3 py-2 text-white text-xs font-medium rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 focus-visible:ring-offset-stone-800";

  return (
    <>
      {/* Always-present live region: announces toolbar actions when selection activates (WCAG 4.1.3) */}
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {`Text selected. Use arrow keys for actions: ${actionLabels}`}
      </span>
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Text selection actions"
      onKeyDown={handleToolbarKeyDown}
      className="fixed z-50 flex items-center gap-0.5 bg-stone-800/95 backdrop-blur rounded-xl shadow-xl border border-white/10 px-1 py-1 animate-fade-in"
      style={{ left, top }}
    >
      {(() => {
        let _i = 0;
        const readIdx      = onRead      ? _i++ : -1;
        const highlightIdx = onHighlight ? _i++ : -1;
        const noteIdx      = onNote      ? _i++ : -1;
        const chatIdx      = onChat      ? _i++ : -1;
        const vocabIdx     = onVocab     ? _i++ : -1;
        return (
          <>
            {onRead && (
              <button
                aria-label="Read aloud"
                tabIndex={focusedToolbarIdx === readIdx ? 0 : -1}
                onFocus={() => setFocusedToolbarIdx(readIdx)}
                onClick={() => handleAction(onRead)}
                className={btnClass}
              >
                <SpeakerIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Read
              </button>
            )}
            {onHighlight && (
              <button
                aria-label="Highlight"
                tabIndex={focusedToolbarIdx === highlightIdx ? 0 : -1}
                onFocus={() => setFocusedToolbarIdx(highlightIdx)}
                onClick={() => { if (!onHighlight || !selection) return; onHighlight(selection.text); window.getSelection()?.removeAllRanges(); setSelection(null); }}
                className={btnClass}
              >
                <HighlightIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Highlight
              </button>
            )}
            {onNote && (
              <button
                aria-label="Add note"
                tabIndex={focusedToolbarIdx === noteIdx ? 0 : -1}
                onFocus={() => setFocusedToolbarIdx(noteIdx)}
                onClick={() => handleAction(onNote)}
                className={btnClass}
              >
                <NoteIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Note
              </button>
            )}
            {onChat && (
              <button
                aria-label="Ask AI"
                tabIndex={focusedToolbarIdx === chatIdx ? 0 : -1}
                onFocus={() => setFocusedToolbarIdx(chatIdx)}
                onClick={() => handleAction(onChat)}
                className={btnClass}
              >
                <ChatIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Chat
              </button>
            )}
            {onVocab && (
              <button
                aria-label="Look up word"
                tabIndex={focusedToolbarIdx === vocabIdx ? 0 : -1}
                onFocus={() => setFocusedToolbarIdx(vocabIdx)}
                onClick={handleVocabAction}
                className={btnClass}
              >
                <WordIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Word
              </button>
            )}
          </>
        );
      })()}
    </div>
    </>
  );
}

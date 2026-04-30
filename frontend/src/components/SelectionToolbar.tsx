"use client";
import { useEffect, useRef, useState } from "react";
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
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleSelection() {
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
    }

    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, []);

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
        {`Text selected. Press Tab for actions: ${actionLabels}`}
      </span>
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Text selection actions"
      className="fixed z-50 flex items-center gap-0.5 bg-stone-800/95 backdrop-blur rounded-xl shadow-xl border border-white/10 px-1 py-1 animate-fade-in"
      style={{ left, top }}
    >
      {onRead && (
        <button aria-label="Read aloud" onClick={() => handleAction(onRead)} className={btnClass}>
          <SpeakerIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Read
        </button>
      )}
      {onHighlight && (
        <button aria-label="Highlight" onClick={() => { if (!onHighlight || !selection) return; onHighlight(selection.text); window.getSelection()?.removeAllRanges(); setSelection(null); }} className={btnClass}>
          <HighlightIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Highlight
        </button>
      )}
      {onNote && (
        <button aria-label="Add note" onClick={() => handleAction(onNote)} className={btnClass}>
          <NoteIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Note
        </button>
      )}
      {onChat && (
        <button aria-label="Ask AI" onClick={() => handleAction(onChat)} className={btnClass}>
          <ChatIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Chat
        </button>
      )}
      {onVocab && (
        <button aria-label="Look up word" onClick={handleVocabAction} className={btnClass}>
          <WordIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Word
        </button>
      )}
    </div>
    </>
  );
}

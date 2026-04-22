"use client";
import { useEffect, useRef, useState } from "react";

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

  if (!selection) return null;

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

  const btnClass = "flex items-center gap-1 px-3 py-2 text-white text-xs font-medium rounded-lg hover:bg-stone-700 active:bg-stone-600 transition-colors min-h-[40px]";

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-0.5 bg-stone-800 rounded-xl shadow-xl px-1 py-1 animate-fade-in"
      style={{ left, top }}
    >
      {onRead && (
        <button onClick={() => handleAction(onRead)} className={btnClass}>🔊 Read</button>
      )}
      {onHighlight && (
        <button onClick={() => handleAction(onHighlight)} className={btnClass}>🎨 Highlight</button>
      )}
      {onNote && (
        <button onClick={() => handleAction(onNote)} className={btnClass}>📝 Note</button>
      )}
      {onChat && (
        <button onClick={() => handleAction(onChat)} className={btnClass}>💬 Chat</button>
      )}
      {onVocab && (
        <button onClick={handleVocabAction} className={btnClass}>📚 Word</button>
      )}
    </div>
  );
}

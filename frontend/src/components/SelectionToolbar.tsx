"use client";
import { useEffect, useRef, useState } from "react";

export interface SelectionAction {
  text: string;
  rect: DOMRect;
}

interface Props {
  onRead?: (text: string) => void;
  onHighlight?: (text: string) => void;
  onNote?: (text: string) => void;
  onChat?: (text: string) => void;
}

export default function SelectionToolbar({ onRead, onHighlight, onNote, onChat }: Props) {
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
      setSelection({ text, rect });
    }

    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, []);

  // Close when clicking outside or when the reader scrolls
  useEffect(() => {
    if (!selection) return;
    function handleClick(e: MouseEvent) {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      // Small delay to let the action handlers fire first
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

  // Position toolbar above the selection, centered
  const scrollEl = document.getElementById("reader-scroll");
  const scrollRect = scrollEl?.getBoundingClientRect();
  const toolbarWidth = 220;

  let left = selection.rect.left + selection.rect.width / 2 - toolbarWidth / 2;
  let top = selection.rect.top - 52;

  // Keep within viewport
  if (left < 8) left = 8;
  if (left + toolbarWidth > window.innerWidth - 8) left = window.innerWidth - toolbarWidth - 8;
  // If not enough space above, show below
  if (top < (scrollRect?.top ?? 60)) {
    top = selection.rect.bottom + 8;
  }

  function handleAction(fn?: (text: string) => void) {
    if (!fn || !selection) return;
    fn(selection.text);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-0.5 bg-stone-800 rounded-xl shadow-xl px-1 py-1 animate-fade-in"
      style={{ left, top }}
    >
      {onRead && (
        <button
          onClick={() => handleAction(onRead)}
          className="flex items-center gap-1 px-3 py-2 text-white text-xs font-medium rounded-lg hover:bg-stone-700 active:bg-stone-600 transition-colors min-h-[40px]"
        >
          🔊 Read
        </button>
      )}
      {onHighlight && (
        <button
          onClick={() => handleAction(onHighlight)}
          className="flex items-center gap-1 px-3 py-2 text-white text-xs font-medium rounded-lg hover:bg-stone-700 active:bg-stone-600 transition-colors min-h-[40px]"
        >
          🎨 Highlight
        </button>
      )}
      {onNote && (
        <button
          onClick={() => handleAction(onNote)}
          className="flex items-center gap-1 px-3 py-2 text-white text-xs font-medium rounded-lg hover:bg-stone-700 active:bg-stone-600 transition-colors min-h-[40px]"
        >
          📝 Note
        </button>
      )}
      {onChat && (
        <button
          onClick={() => handleAction(onChat)}
          className="flex items-center gap-1 px-3 py-2 text-white text-xs font-medium rounded-lg hover:bg-stone-700 active:bg-stone-600 transition-colors min-h-[40px]"
        >
          💬 Chat
        </button>
      )}
    </div>
  );
}

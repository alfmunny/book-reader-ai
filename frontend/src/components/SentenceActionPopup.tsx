"use client";
import { useEffect, useRef, useState } from "react";
import { SpeakerIcon, NoteIcon, ChatIcon } from "@/components/Icons";

interface Props {
  sentenceText: string;
  position: { x: number; y: number };
  onRead: () => void;
  onNote?: () => void;
  onChat?: () => void;
  onClose: () => void;
}

export default function SentenceActionPopup({ sentenceText: _sentenceText, position, onRead, onNote, onChat, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [focusedToolbarIdx, setFocusedToolbarIdx] = useState(0);

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

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", handleKey);
    // Delay so the click that opened the popup doesn't immediately close it
    const t = setTimeout(() => document.addEventListener("mousedown", handleDown), 100);
    return () => {
      document.removeEventListener("keydown", handleKey);
      clearTimeout(t);
      document.removeEventListener("mousedown", handleDown);
    };
  }, [onClose]);

  // Position popup above the click point, keep within viewport
  const popupW = 180;
  const popupH = 44;
  let left = position.x - popupW / 2;
  let top = position.y - popupH - 12;

  if (left < 8) left = 8;
  if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
  if (top < 8) top = position.y + 16;

  const readIdx = 0;
  const noteIdx = onNote ? 1 : -1;
  const chatIdx = onChat ? (onNote ? 2 : 1) : -1;

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-50 animate-fade-in"
    >
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Sentence actions"
        onKeyDown={handleToolbarKeyDown}
        className="flex items-center gap-0.5 bg-stone-800 rounded-xl shadow-xl px-1 py-1"
      >
        <button
          onClick={() => { setFocusedToolbarIdx(readIdx); onRead(); onClose(); }}
          onFocus={() => setFocusedToolbarIdx(readIdx)}
          tabIndex={focusedToolbarIdx === readIdx ? 0 : -1}
          className="flex items-center gap-1 px-3 py-2 text-white text-xs font-medium rounded-lg hover:bg-stone-700 active:bg-stone-600 transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 focus-visible:ring-offset-stone-800"
        >
          <SpeakerIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> Read
        </button>
        {onNote && (
          <button
            onClick={() => { setFocusedToolbarIdx(noteIdx); onNote(); onClose(); }}
            onFocus={() => setFocusedToolbarIdx(noteIdx)}
            tabIndex={focusedToolbarIdx === noteIdx ? 0 : -1}
            className="flex items-center gap-1 px-3 py-2 text-white text-xs font-medium rounded-lg hover:bg-stone-700 active:bg-stone-600 transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 focus-visible:ring-offset-stone-800"
          >
            <NoteIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> Note
          </button>
        )}
        {onChat && (
          <button
            onClick={() => { setFocusedToolbarIdx(chatIdx); onChat(); onClose(); }}
            onFocus={() => setFocusedToolbarIdx(chatIdx)}
            tabIndex={focusedToolbarIdx === chatIdx ? 0 : -1}
            className="flex items-center gap-1 px-3 py-2 text-white text-xs font-medium rounded-lg hover:bg-stone-700 active:bg-stone-600 transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 focus-visible:ring-offset-stone-800"
          >
            <ChatIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> Chat
          </button>
        )}
      </div>
    </div>
  );
}

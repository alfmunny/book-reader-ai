"use client";
import { useEffect, useRef } from "react";
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

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-50 flex items-center gap-0.5 bg-stone-800 rounded-xl shadow-xl px-1 py-1 animate-fade-in"
    >
      <button
        onClick={() => { onRead(); onClose(); }}
        className="flex items-center gap-1 px-3 py-2 text-white text-xs font-medium rounded-lg hover:bg-stone-700 active:bg-stone-600 transition-colors min-h-[36px]"
      >
        <SpeakerIcon className="w-3.5 h-3.5 shrink-0" /> Read
      </button>
      {onNote && (
        <button
          onClick={() => { onNote(); onClose(); }}
          className="flex items-center gap-1 px-3 py-2 text-white text-xs font-medium rounded-lg hover:bg-stone-700 active:bg-stone-600 transition-colors min-h-[36px]"
        >
          <NoteIcon className="w-3.5 h-3.5 shrink-0" /> Note
        </button>
      )}
      {onChat && (
        <button
          onClick={() => { onChat(); onClose(); }}
          className="flex items-center gap-1 px-3 py-2 text-white text-xs font-medium rounded-lg hover:bg-stone-700 active:bg-stone-600 transition-colors min-h-[36px]"
        >
          <ChatIcon className="w-3.5 h-3.5 shrink-0" /> Chat
        </button>
      )}
    </div>
  );
}

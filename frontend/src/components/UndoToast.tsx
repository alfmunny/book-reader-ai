"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// WCAG 2.2.1: 5 s gives keyboard users enough time to reach the Undo button.
// The timer also pauses while the toast is hovered or focused (see handlers below).
const DURATION_MS = 5000;

interface Props {
  message: string;
  onUndo: () => void;
  onDone: () => void;
}

export default function UndoToast({ message, onUndo, onDone }: Props) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 300);
    }, DURATION_MS);
  }, [onDone]);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [startTimer]);

  function pause() {
    if (!pausedRef.current) {
      pausedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  }

  function resume() {
    if (pausedRef.current) {
      pausedRef.current = false;
      startTimer();
    }
  }

  function handleUndo() {
    setVisible(false);
    onUndo();
    setTimeout(onDone, 300);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-stone-800 text-white rounded-xl shadow-xl px-4 py-3 text-sm flex items-center gap-3 transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <span>{message}</span>
      <button
        onClick={handleUndo}
        className="font-semibold text-amber-300 hover:text-amber-200 transition-colors shrink-0 min-h-[44px] md:min-h-0 flex items-center px-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-800"
      >
        Undo
      </button>
    </div>
  );
}

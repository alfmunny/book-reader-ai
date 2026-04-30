"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircleIcon } from "@/components/Icons";

interface Props {
  word: string;
  onDone: () => void;
  language?: string;
}

// WCAG 2.2.1: 4 s gives users enough time to read the confirmation.
// The timer pauses while the toast is hovered or focused.
const DURATION_MS = 4000;

export default function VocabularyToast({ word, onDone, language }: Props) {
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

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className={`fixed bottom-6 right-6 z-50 bg-white border border-amber-300 shadow-lg rounded-xl px-4 py-3 text-sm font-medium text-ink transition-all duration-300 flex items-center gap-2.5 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <CheckCircleIcon className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
      <span><strong lang={language ?? undefined}>{word}</strong> saved to vocabulary</span>
    </div>
  );
}

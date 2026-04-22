"use client";
import { useEffect, useState } from "react";
import { CheckCircleIcon } from "@/components/Icons";

interface Props {
  word: string;
  onDone: () => void;
}

export default function VocabularyToast({ word, onDone }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 300);
    }, 2000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`fixed bottom-6 right-6 z-50 bg-white border border-amber-300 shadow-lg rounded-xl px-4 py-3 text-sm font-medium text-ink transition-all duration-300 flex items-center gap-2.5 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <CheckCircleIcon className="w-4 h-4 text-emerald-600 shrink-0" />
      <span><strong>{word}</strong> saved to vocabulary</span>
    </div>
  );
}

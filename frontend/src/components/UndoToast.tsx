"use client";
import { useEffect, useState } from "react";

const DURATION_MS = 3000;

interface Props {
  message: string;
  onUndo: () => void;
  onDone: () => void;
}

export default function UndoToast({ message, onUndo, onDone }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 300);
    }, DURATION_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

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
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-stone-800 text-white rounded-xl shadow-xl px-4 py-3 text-sm flex items-center gap-3 transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <span>{message}</span>
      <button
        onClick={handleUndo}
        className="font-semibold text-amber-300 hover:text-amber-200 transition-colors shrink-0 min-h-[44px] flex items-center px-1"
      >
        Undo
      </button>
    </div>
  );
}

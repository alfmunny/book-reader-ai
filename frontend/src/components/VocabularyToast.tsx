"use client";
import { useEffect, useState } from "react";

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
      className={`fixed bottom-6 right-6 z-50 bg-white border border-amber-300 shadow-lg rounded-xl px-5 py-3 text-sm font-medium text-ink transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <span role="img" aria-label="save">💾</span>{" "}
      <strong>{word}</strong> saved to vocabulary
    </div>
  );
}

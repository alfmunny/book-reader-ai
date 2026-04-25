"use client";
import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  feature: string;
  onClose: () => void;
}

export default function AuthPromptModal({ open, feature, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Sign in required" className="relative bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-6 w-full max-w-sm animate-slide-up focus:outline-none">
        <p className="font-serif text-lg text-ink mb-1">Sign in to {feature}</p>
        <p className="text-sm text-stone-500 mb-5">
          Create a free account or sign in to unlock this feature.
        </p>
        <a
          href="/api/auth/signin"
          className="flex items-center justify-center w-full min-h-[44px] bg-amber-700 hover:bg-amber-800 text-white text-center rounded-xl font-medium transition-colors"
        >
          Sign in
        </a>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-full min-h-[44px] text-sm text-stone-500 mt-2 hover:text-stone-700 transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

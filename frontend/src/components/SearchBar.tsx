"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { SearchIcon } from "@/components/Icons";

/** Collapsible header search. Click the icon to expand an input; submit navigates
 *  to /search?q=... Keyboard shortcut `/` focuses the input (if not typing elsewhere). */
export function SearchBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Global keyboard shortcut: "/" opens the search bar unless the user is
  // already typing inside an input/textarea/contentEditable.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return;
      e.preventDefault();
      setOpen(true);
      focusInput();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusInput]);

  const submit = () => {
    const q = query.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Open search"
        onClick={() => {
          setOpen(true);
          focusInput();
        }}
        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md text-ink hover:bg-amber-100 transition-colors"
      >
        <SearchIcon className="w-5 h-5" />
      </button>
    );
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="inline-flex items-center gap-2 min-h-[44px] px-2 border border-amber-200 rounded-md bg-parchment animate-fade-in"
    >
      <SearchIcon className="w-4 h-4 text-ink" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search notes, vocabulary, chapters…"
        aria-label="Search your content"
        maxLength={200}
        className="bg-transparent outline-none min-w-[14rem] py-1 text-sm text-ink placeholder:text-stone-400"
      />
      <button
        type="button"
        aria-label="Close search"
        onClick={() => {
          setQuery("");
          setOpen(false);
        }}
        className="text-xs text-stone-500 hover:text-ink"
      >
        Esc
      </button>
    </form>
  );
}

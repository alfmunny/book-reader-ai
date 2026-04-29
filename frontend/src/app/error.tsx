"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertCircleIcon, ArrowLeftIcon, RetryIcon } from "@/components/Icons";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: Props) {
  useEffect(() => {
    document.title = "Error — Book Reader AI";
    return () => { document.title = "My Library — Book Reader AI"; };
  }, []);
  return (
    <main id="main-content" className="min-h-screen bg-parchment flex items-center justify-center px-4">
      <div role="alert" className="text-center max-w-sm">
        <AlertCircleIcon className="w-14 h-14 mx-auto mb-4 text-red-400" aria-hidden="true" />
        <h1 className="font-serif text-2xl font-bold text-ink mb-2">Something went wrong</h1>
        <p className="text-sm text-stone-600 mb-6">
          {error.message || "An unexpected error occurred. Try again, or head back to the library."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-700 text-white hover:bg-amber-800 text-sm font-medium transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
          >
            <RetryIcon className="w-4 h-4" aria-hidden="true" /> Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-sm font-medium transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" /> Library
          </Link>
        </div>
      </div>
    </main>
  );
}

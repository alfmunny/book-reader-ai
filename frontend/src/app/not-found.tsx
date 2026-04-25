import Link from "next/link";
import { BookOpenIcon, ArrowRightIcon } from "@/components/Icons";

export default function NotFound() {
  return (
    <main id="main-content" className="min-h-screen bg-parchment flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <BookOpenIcon className="w-14 h-14 mx-auto mb-4 text-amber-300" aria-hidden="true" />
        <h1 className="font-serif text-2xl font-bold text-ink mb-2">Page not found</h1>
        <p className="text-sm text-stone-500 mb-6">
          The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-700 text-white hover:bg-amber-800 text-sm font-medium transition-colors min-h-[44px]"
        >
          Browse books <ArrowRightIcon className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}

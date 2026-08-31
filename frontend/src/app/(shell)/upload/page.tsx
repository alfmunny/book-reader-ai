"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { uploadBook, getUploadQuota, UploadQuota, ApiError } from "@/lib/api";
import { AlertCircleIcon, UploadIcon } from "@/components/Icons";

export default function UploadPage() {
  const router = useRouter();
  const { status } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Upload a Book — Book Reader AI";
  }, []);

  const [quota, setQuota] = useState<UploadQuota | null>(null);
  const [quotaFetchError, setQuotaFetchError] = useState(false);
  const [quotaRetryTick, setQuotaRetryTick] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    setQuotaFetchError(false);
    getUploadQuota().then(setQuota).catch(() => setQuotaFetchError(true));
  }, [status, quotaRetryTick]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      const name = file.name.toLowerCase();
      if (!name.endsWith(".txt") && !name.endsWith(".epub")) {
        setError("Only .txt and .epub files are supported.");
        return;
      }
      setUploading(true);
      try {
        const result = await uploadBook(file);
        router.push(`/upload/${result.book_id}/chapters`);
      } catch (e: unknown) {
        if (e instanceof ApiError) {
          setError(e.message);
        } else {
          setError("Upload failed. Please try again.");
        }
        setUploading(false);
      }
    },
    [router],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  if (status === "unauthenticated") {
    return (
      <main id="main-content" className="min-h-screen bg-parchment flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <UploadIcon className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h1 className="font-serif text-xl font-semibold text-ink mb-2">Sign in to upload books</h1>
          <p className="text-sm text-amber-700 mb-6">
            Create an account to upload your own .txt or .epub files and read them with AI assistance.
          </p>
          <Link
            href="/login"
            className="rounded-lg bg-amber-700 px-6 min-h-[44px] md:min-h-0 inline-flex items-center text-white font-medium hover:bg-amber-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main id="main-content" className="min-h-screen bg-parchment flex items-center justify-center">
        <div role="status" aria-label="Loading upload page">
          <span className="sr-only">Loading upload page...</span>
          <span className="w-6 h-6 border-2 border-amber-400 border-t-amber-700 rounded-full animate-spin block" aria-hidden="true" />
        </div>
      </main>
    );
  }

  // `max` is null for admins — no limit. Without the null check this read
  // `used >= null`, which coerces to `used >= 0` and is therefore always
  // true, disabling uploads for the one role that has no cap.
  const quotaFull = quota !== null && quota.max !== null && quota.used >= quota.max;

  return (
    <main id="main-content" className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center gap-3">
          <h1 className="font-serif text-xl font-bold text-ink">Upload a Book</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">

        {/* Quota error */}
        {quotaFetchError && (
          <div role="alert" className="flex items-center justify-between rounded-xl border border-amber-100 bg-white p-4">
            <p className="text-sm text-stone-500">Couldn&apos;t load quota.</p>
            <button
              onClick={() => setQuotaRetryTick((t) => t + 1)}
              className="text-xs px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              Retry
            </button>
          </div>
        )}

        {/* Quota bar */}
        {quota !== null && (
          <div className="bg-white rounded-xl border border-amber-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-ink">Your uploaded books</p>
              <p className="text-sm text-amber-700">
                {quota.max === null ? `${quota.used} uploaded · No limit` : `${quota.used} / ${quota.max}`}
              </p>
            </div>
            {/* A bar needs a denominator. With none, `used / null` is Infinity,
                which clamped to a permanently full bar for admins. */}
            {quota.max !== null && (
              <div
                className="h-2 rounded-full bg-amber-100 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(100, (quota.used / quota.max) * 100))}
                aria-label={`Upload quota: ${quota.used} of ${quota.max} books used`}
              >
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-200"
                  style={{ width: `${Math.min(100, (quota.used / quota.max) * 100)}%` }}
                />
              </div>
            )}
            {quotaFull && (
              <p className="text-xs text-red-600 mt-2">
                Upload limit reached. Delete an uploaded book to add more.
              </p>
            )}
          </div>
        )}

        {/* Drop zone */}
        <div
          role="button"
          aria-label="Upload a book file"
          aria-disabled={quotaFull || uploading}
          tabIndex={0}
          onClick={() => !uploading && !quotaFull && fileInputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !uploading && !quotaFull && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-2xl border-2 border-dashed p-12 flex flex-col items-center justify-center text-center transition-all duration-200 cursor-pointer select-none
            ${dragging ? "border-amber-500 bg-amber-50" : "border-amber-200 bg-white hover:border-amber-400 hover:bg-amber-50/50"}
            ${quotaFull || uploading ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          {uploading ? (
            <div role="status" aria-label="Uploading file" className="flex flex-col items-center">
              <div className="w-10 h-10 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin mb-4" aria-hidden="true" />
              <p className="font-serif text-lg text-ink">Uploading and parsing…</p>
              <p className="text-sm text-amber-700 mt-1">This may take a moment for large files.</p>
            </div>
          ) : (
            <>
              <UploadIcon className="w-10 h-10 text-amber-400 mb-4" />
              <p className="font-serif text-lg font-semibold text-ink mb-1">
                {dragging ? "Drop your file here" : "Drag & drop or click to choose"}
              </p>
              <p className="text-sm text-amber-700">Supported formats: .txt (up to 3 MB), .epub (up to 15 MB)</p>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.epub"
          className="sr-only"
          onChange={onInputChange}
          aria-hidden="true"
        />

        {/* Error */}
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircleIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Format hints */}
        <div className="rounded-xl border border-amber-100 bg-white/60 p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-600">Tips</h2>
          <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
            <li>Plain text (.txt) files work best when chapters start with &quot;Chapter I&quot;, &quot;CHAPTER 1&quot;, etc.</li>
            <li>EPUB files are parsed automatically using the book&apos;s built-in structure.</li>
            <li>After uploading you&apos;ll be able to review and rename chapters before reading.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

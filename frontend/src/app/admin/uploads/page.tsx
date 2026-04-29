"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/lib/adminFetch";
import { AlertCircleIcon, CloseIcon, EmptyUploadIcon, RetryIcon } from "@/components/Icons";

interface UploadEntry {
  book_id: number;
  title: string;
  filename: string;
  file_size: number;
  format: string;
  uploaded_at: string;
  uploader_email: string;
  uploader_name: string;
}

function fmt_size(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function fmt_date(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function UploadsPage() {
  const router = useRouter();
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterInput, setFilterInput] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("");

  useEffect(() => {
    document.title = "Admin: Uploads — Book Reader AI";
  }, []);

  const load = useCallback(
    async (userId?: string) => {
      setLoading(true);
      setError("");
      try {
        const path = userId ? `/admin/uploads?user_id=${encodeURIComponent(userId)}` : "/admin/uploads";
        const data = await adminFetch(path);
        setUploads(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load uploads");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  function handleFilter() {
    const trimmed = filterInput.trim();
    setActiveFilter(trimmed);
    load(trimmed || undefined);
  }

  function clearFilter() {
    setFilterInput("");
    setActiveFilter("");
    load();
  }

  if (loading) {
    return (
      <div role="status" aria-label="Loading uploads" className="flex items-center justify-center py-16">
        <span className="sr-only">Loading uploads...</span>
        <div className="w-6 h-6 border-4 border-amber-300 border-t-amber-700 rounded-full animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="sr-only">Uploads</h2>
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-3">
          <AlertCircleIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 text-xs font-medium transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
          >
            <RetryIcon className="w-3.5 h-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input
          type="number"
          placeholder="Filter by user ID…"
          value={filterInput}
          onChange={(e) => setFilterInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFilter()}
          className="w-48 rounded-lg border border-amber-300 px-3 py-2 text-sm placeholder:text-stone-600"
          aria-label="User ID filter"
          min={1}
        />
        <button
          onClick={handleFilter}
          aria-label="Filter uploads"
          className="rounded-lg bg-amber-700 text-white px-4 py-2 min-h-[44px] md:min-h-0 text-sm hover:bg-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
        >
          Filter
        </button>
        {activeFilter && (
          <button
            onClick={clearFilter}
            className="text-sm text-amber-700 hover:text-amber-900 min-h-[44px] md:min-h-0 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            <CloseIcon className="w-3.5 h-3.5 inline" aria-hidden="true" /> Clear filter (user {activeFilter})
          </button>
        )}
        <span className="ml-auto text-xs text-stone-600">{uploads.length} upload{uploads.length !== 1 ? "s" : ""}</span>
      </div>

      {uploads.length === 0 ? (
        <div className="bg-white rounded-xl border border-amber-200 px-4 py-12 text-center">
          <EmptyUploadIcon className="mx-auto mb-3 w-10 h-10 text-amber-200" />
          <p className="font-serif text-ink mb-1">No uploads yet</p>
          <p className="text-sm text-stone-600">
            {activeFilter ? `No uploads found for user ${activeFilter}.` : "No books have been uploaded by users."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Uploaded books">
              <thead>
                <tr className="border-b border-amber-200 bg-amber-50/60">
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-amber-800">Title</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-amber-800">File</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-amber-800">Format</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-amber-800">Size</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-amber-800">Uploader</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-amber-800">Date</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium text-amber-800" aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {uploads.map((u) => (
                  <tr key={`${u.book_id}-${u.filename}`} className="hover:bg-amber-50/40">
                    <td className="px-4 py-2.5 font-medium text-ink max-w-[200px] truncate" title={u.title}>{u.title}</td>
                    <td className="px-4 py-2.5 text-stone-600 max-w-[160px] truncate" title={u.filename}>{u.filename}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        {u.format}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-stone-600 whitespace-nowrap">{fmt_size(u.file_size)}</td>
                    <td className="px-4 py-2.5 text-stone-600 max-w-[160px] truncate" title={u.uploader_email}>
                      {u.uploader_email}
                    </td>
                    <td className="px-4 py-2.5 text-stone-600 whitespace-nowrap">{fmt_date(u.uploaded_at)}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => router.push(`/reader/${u.book_id}`)}
                        aria-label={`Open ${u.title}`}
                        className="text-xs text-amber-700 hover:text-amber-800 min-h-[44px] md:min-h-0 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

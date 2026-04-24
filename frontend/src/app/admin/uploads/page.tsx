"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/lib/adminFetch";
import { CloseIcon } from "@/components/Icons";

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
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-4 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      <div className="flex gap-2 items-center">
        <input
          type="number"
          placeholder="Filter by user ID…"
          value={filterInput}
          onChange={(e) => setFilterInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFilter()}
          className="w-48 rounded-lg border border-amber-300 px-3 py-2 text-sm"
          aria-label="User ID filter"
          min={1}
        />
        <button
          onClick={handleFilter}
          className="rounded-lg bg-amber-700 text-white px-4 py-2 min-h-[44px] text-sm hover:bg-amber-800"
          aria-label="Filter uploads"
        >
          Filter
        </button>
        {activeFilter && (
          <button
            onClick={clearFilter}
            className="text-sm text-amber-600 hover:text-amber-900 min-h-[44px] flex items-center"
          >
            <CloseIcon className="w-3.5 h-3.5 inline" aria-hidden="true" /> Clear filter (user {activeFilter})
          </button>
        )}
        <span className="ml-auto text-xs text-stone-400">{uploads.length} upload{uploads.length !== 1 ? "s" : ""}</span>
      </div>

      {uploads.length === 0 ? (
        <div className="bg-white rounded-xl border border-amber-200 px-4 py-12 text-center">
          <svg
            className="mx-auto mb-3 w-10 h-10 text-amber-200"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          <p className="font-serif text-ink mb-1">No uploads yet</p>
          <p className="text-sm text-stone-400">
            {activeFilter ? `No uploads found for user ${activeFilter}.` : "No books have been uploaded by users."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-amber-200 bg-amber-50/60">
                  <th className="px-4 py-2.5 text-left font-medium text-amber-800">Title</th>
                  <th className="px-4 py-2.5 text-left font-medium text-amber-800">File</th>
                  <th className="px-4 py-2.5 text-left font-medium text-amber-800">Format</th>
                  <th className="px-4 py-2.5 text-left font-medium text-amber-800">Size</th>
                  <th className="px-4 py-2.5 text-left font-medium text-amber-800">Uploader</th>
                  <th className="px-4 py-2.5 text-left font-medium text-amber-800">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium text-amber-800"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {uploads.map((u) => (
                  <tr key={`${u.book_id}-${u.filename}`} className="hover:bg-amber-50/40">
                    <td className="px-4 py-2.5 font-medium text-ink max-w-[200px] truncate">{u.title}</td>
                    <td className="px-4 py-2.5 text-stone-500 max-w-[160px] truncate">{u.filename}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        {u.format}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-stone-500 whitespace-nowrap">{fmt_size(u.file_size)}</td>
                    <td className="px-4 py-2.5 text-stone-500 max-w-[160px] truncate" title={u.uploader_email}>
                      {u.uploader_email}
                    </td>
                    <td className="px-4 py-2.5 text-stone-400 whitespace-nowrap">{fmt_date(u.uploaded_at)}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => router.push(`/reader/${u.book_id}`)}
                        className="text-xs text-amber-600 hover:text-amber-800 min-h-[44px] flex items-center"
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

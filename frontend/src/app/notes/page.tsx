"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getAllAnnotations, updateAnnotation, deleteAnnotation, AnnotationWithBook } from "@/lib/api";

const COLOR_BADGE: Record<string, string> = {
  yellow: "bg-yellow-100 border-yellow-300 text-yellow-800",
  blue:   "bg-blue-100 border-blue-300 text-blue-800",
  green:  "bg-green-100 border-green-300 text-green-800",
  pink:   "bg-pink-100 border-pink-300 text-pink-800",
};

const COLOR_PILL: Record<string, string> = {
  yellow: "bg-yellow-100 border-yellow-300 text-yellow-700 hover:bg-yellow-200",
  blue:   "bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200",
  green:  "bg-green-100 border-green-300 text-green-700 hover:bg-green-200",
  pink:   "bg-pink-100 border-pink-300 text-pink-700 hover:bg-pink-200",
};

const COLORS = ["yellow", "blue", "green", "pink"] as const;

export default function NotesPage() {
  const router = useRouter();
  const { status } = useSession();

  const [annotations, setAnnotations] = useState<AnnotationWithBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [colorFilter, setColorFilter] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated") return;
    getAllAnnotations()
      .then(setAnnotations)
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function toggleColor(c: string) {
    setColorFilter((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return annotations.filter((a) => {
      if (colorFilter.size > 0 && !colorFilter.has(a.color)) return false;
      if (q) {
        const haystack = `${a.sentence_text} ${a.note_text} ${a.book_title ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [annotations, colorFilter, search]);

  // Group by book_id, preserving order
  const grouped = useMemo(() => {
    const order: number[] = [];
    const map = new Map<number, { title: string; items: AnnotationWithBook[] }>();
    for (const a of filtered) {
      if (!map.has(a.book_id)) {
        map.set(a.book_id, { title: a.book_title ?? `Book #${a.book_id}`, items: [] });
        order.push(a.book_id);
      }
      map.get(a.book_id)!.items.push(a);
    }
    return order.map((id) => ({ bookId: id, ...map.get(id)! }));
  }, [filtered]);

  async function handleSave(ann: AnnotationWithBook) {
    setSaving(ann.id);
    try {
      const updated = await updateAnnotation(ann.id, { note_text: editText, color: ann.color });
      setAnnotations((prev) => prev.map((a) => (a.id === ann.id ? { ...a, ...updated } : a)));
      setEditingId(null);
    } catch {
      // ignore
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this annotation?")) return;
    setDeleting(id);
    try {
      await deleteAnnotation(id);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  function handleColorChange(ann: AnnotationWithBook, color: string) {
    updateAnnotation(ann.id, { note_text: ann.note_text, color })
      .then((updated) => setAnnotations((prev) => prev.map((a) => (a.id === ann.id ? { ...a, ...updated } : a))))
      .catch(() => {});
  }

  return (
    <main className="min-h-screen bg-parchment">
      {/* Header */}
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur px-4 md:px-6 py-3 md:py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="text-amber-700 hover:text-amber-900 text-sm font-medium transition-colors shrink-0"
          >
            ← Library
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-serif font-bold text-ink">Your Notes</h1>
          </div>
          {!loading && (
            <span className="text-xs text-stone-400">{annotations.length} annotation{annotations.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => toggleColor(c)}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  colorFilter.has(c)
                    ? `${COLOR_PILL[c]} ring-2 ring-offset-1 ring-current`
                    : COLOR_PILL[c]
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20">
            <span className="w-6 h-6 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-20 text-stone-400">
            <p className="text-4xl mb-3">📝</p>
            <p className="font-serif text-lg text-ink mb-1">No notes yet</p>
            {annotations.length > 0 ? (
              <p className="text-sm">No results for the current filter.</p>
            ) : (
              <p className="text-sm">Long-press a sentence while reading to add an annotation.</p>
            )}
          </div>
        ) : (
          <div className="space-y-10">
            {grouped.map(({ bookId, title, items }) => (
              <section key={bookId}>
                {/* Book header */}
                <div className="flex items-baseline gap-3 mb-3">
                  <button
                    onClick={() => router.push(`/reader/${bookId}`)}
                    className="font-serif font-semibold text-ink text-base hover:text-amber-800 transition-colors text-left"
                  >
                    {title}
                  </button>
                  <span className="text-xs text-stone-400">{items.length} note{items.length !== 1 ? "s" : ""}</span>
                  <button
                    onClick={() => router.push(`/reader/${bookId}`)}
                    className="ml-auto text-xs text-amber-700 hover:text-amber-900 shrink-0"
                  >
                    Open →
                  </button>
                </div>

                <div className="space-y-2">
                  {items.map((ann) => (
                    <div
                      key={ann.id}
                      className={`rounded-lg border px-4 py-3 ${COLOR_BADGE[ann.color] ?? COLOR_BADGE.yellow}`}
                    >
                      {/* Top row: chapter + color picker + delete */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide opacity-60">
                          Ch. {ann.chapter_index + 1}
                        </span>
                        <div className="flex gap-1 ml-auto">
                          {COLORS.map((c) => (
                            <button
                              key={c}
                              onClick={() => handleColorChange(ann, c)}
                              title={c}
                              className={`w-3.5 h-3.5 rounded-full border transition-transform ${
                                ann.color === c ? "scale-125 border-current" : "border-transparent opacity-50 hover:opacity-100"
                              } bg-${c}-400`}
                            />
                          ))}
                        </div>
                        <button
                          onClick={() => handleDelete(ann.id)}
                          disabled={deleting === ann.id}
                          className="text-xs opacity-40 hover:opacity-80 transition-opacity ml-1"
                          title="Delete annotation"
                        >
                          {deleting === ann.id ? "…" : "✕"}
                        </button>
                      </div>

                      {/* Sentence */}
                      <p className="text-xs italic leading-relaxed mb-2 opacity-80">
                        &ldquo;{ann.sentence_text}&rdquo;
                      </p>

                      {/* Note text / edit */}
                      {editingId === ann.id ? (
                        <div className="space-y-2">
                          <textarea
                            className="w-full rounded border border-current/30 bg-white/60 px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-current"
                            rows={3}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            autoFocus
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs opacity-60 hover:opacity-100"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSave(ann)}
                              disabled={saving === ann.id}
                              className="text-xs font-medium opacity-80 hover:opacity-100"
                            >
                              {saving === ann.id ? "Saving…" : "Save"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="flex items-start gap-2 cursor-pointer group"
                          onClick={() => { setEditingId(ann.id); setEditText(ann.note_text); }}
                        >
                          {ann.note_text ? (
                            <p className="text-xs font-medium flex-1">{ann.note_text}</p>
                          ) : (
                            <p className="text-xs opacity-40 italic flex-1">Add a note…</p>
                          )}
                          <span className="text-xs opacity-0 group-hover:opacity-50 transition-opacity shrink-0">✏️</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createDeck, DeckMode } from "@/lib/api";
import { ArrowLeftIcon, DeckIcon } from "@/components/Icons";

export default function DecksNewPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode] = useState<DeckMode>("manual");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    setSubmitting(true);
    try {
      await createDeck({
        name: trimmedName,
        description: description.trim(),
        mode,
      });
      router.push("/decks");
    } catch (e) {
      const message =
        e instanceof ApiError && e.message
          ? e.message
          : "Could not create the deck. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/70 backdrop-blur px-4 md:px-6 py-3 md:py-4 flex items-center gap-3 md:gap-4">
        <button
          onClick={() => router.push("/decks")}
          className="text-amber-700 hover:text-amber-900 text-sm min-h-[44px] flex items-center"
        >
          <ArrowLeftIcon className="w-4 h-4 shrink-0" /> Decks
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif font-bold text-ink truncate">New deck</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 md:px-6 py-6 md:py-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="deck-name"
              className="block text-sm font-medium text-ink mb-1"
            >
              Name
            </label>
            <input
              id="deck-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              data-testid="deck-name-input"
              className="w-full rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="e.g. German verbs"
            />
          </div>

          <div>
            <label
              htmlFor="deck-description"
              className="block text-sm font-medium text-ink mb-1"
            >
              Description <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="deck-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              data-testid="deck-description-input"
              className="w-full rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="What kind of words will go here?"
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-ink mb-2">Mode</legend>
            <div className="space-y-2">
              <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-white p-3 cursor-pointer has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50">
                <input
                  type="radio"
                  name="mode"
                  value="manual"
                  checked={mode === "manual"}
                  onChange={() => {}}
                  data-testid="deck-mode-manual"
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="font-medium text-ink block">Manual</span>
                  <span className="text-stone-500">
                    Pick members by hand. You add and remove words one at a time.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-amber-100 bg-stone-50 p-3 opacity-60 cursor-not-allowed">
                <input
                  type="radio"
                  name="mode"
                  value="smart"
                  disabled
                  data-testid="deck-mode-smart"
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="font-medium text-ink block">Smart</span>
                  <span className="text-stone-500">
                    Rule-based — membership recomputed at query time. Coming in a later slice.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {error && (
            <p
              data-testid="deck-form-error"
              role="alert"
              className="text-sm text-red-600"
            >
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              data-testid="deck-submit-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-700 text-white hover:bg-amber-800 text-sm font-medium transition-colors min-h-[44px] disabled:opacity-50"
            >
              <DeckIcon className="w-4 h-4" />
              {submitting ? "Creating…" : "Create deck"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/decks")}
              className="text-sm text-amber-700 hover:text-amber-900 min-h-[44px] px-3"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

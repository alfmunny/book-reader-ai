"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createDeck, DeckMode } from "@/lib/api";
import { ArrowLeftIcon, DeckIcon } from "@/components/Icons";

function splitTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export default function DecksNewPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<DeckMode>("manual");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Smart-rule fields
  const [ruleLanguage, setRuleLanguage] = useState("");
  const [ruleTagsAny, setRuleTagsAny] = useState("");
  const [ruleTagsAll, setRuleTagsAll] = useState("");
  const [ruleSavedAfter, setRuleSavedAfter] = useState("");
  const [ruleSavedBefore, setRuleSavedBefore] = useState("");

  function buildRulesJson(): Record<string, unknown> | null {
    const rules: Record<string, unknown> = {};
    if (ruleLanguage.trim()) rules.language = ruleLanguage.trim();
    const tagsAny = splitTags(ruleTagsAny);
    if (tagsAny.length > 0) rules.tags_any = tagsAny;
    const tagsAll = splitTags(ruleTagsAll);
    if (tagsAll.length > 0) rules.tags_all = tagsAll;
    if (ruleSavedAfter) rules.saved_after = ruleSavedAfter;
    if (ruleSavedBefore) rules.saved_before = ruleSavedBefore;
    return Object.keys(rules).length > 0 ? rules : null;
  }

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
        rules_json: mode === "smart" ? buildRulesJson() : null,
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
              Description <span className="text-stone-500 font-normal">(optional)</span>
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
                  onChange={() => setMode("manual")}
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
              <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-white p-3 cursor-pointer has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50">
                <input
                  type="radio"
                  name="mode"
                  value="smart"
                  checked={mode === "smart"}
                  onChange={() => setMode("smart")}
                  data-testid="deck-mode-smart"
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="font-medium text-ink block">Smart</span>
                  <span className="text-stone-500">
                    Rule-based — membership recomputed at query time from your saved vocabulary.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {mode === "smart" && (
            <fieldset
              data-testid="deck-rules-fieldset"
              className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-4"
            >
              <legend className="px-2 text-sm font-medium text-ink">
                Rules <span className="text-stone-500 font-normal">(leave blank to match everything)</span>
              </legend>

              <div>
                <label
                  htmlFor="deck-rule-language"
                  className="block text-sm font-medium text-ink mb-1"
                >
                  Language <span className="text-stone-500 font-normal">(e.g. de, en, zh)</span>
                </label>
                <input
                  id="deck-rule-language"
                  type="text"
                  value={ruleLanguage}
                  onChange={(e) => setRuleLanguage(e.target.value)}
                  maxLength={10}
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="de"
                />
              </div>

              <div>
                <label
                  htmlFor="deck-rule-tags-any"
                  className="block text-sm font-medium text-ink mb-1"
                >
                  Tags any of <span className="text-stone-500 font-normal">(comma-separated)</span>
                </label>
                <input
                  id="deck-rule-tags-any"
                  type="text"
                  value={ruleTagsAny}
                  onChange={(e) => setRuleTagsAny(e.target.value)}
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="grammar, verbs"
                />
              </div>

              <div>
                <label
                  htmlFor="deck-rule-tags-all"
                  className="block text-sm font-medium text-ink mb-1"
                >
                  Tags all of <span className="text-stone-500 font-normal">(comma-separated)</span>
                </label>
                <input
                  id="deck-rule-tags-all"
                  type="text"
                  value={ruleTagsAll}
                  onChange={(e) => setRuleTagsAll(e.target.value)}
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="advanced"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="deck-rule-saved-after"
                    className="block text-sm font-medium text-ink mb-1"
                  >
                    Saved after
                  </label>
                  <input
                    id="deck-rule-saved-after"
                    type="date"
                    value={ruleSavedAfter}
                    onChange={(e) => setRuleSavedAfter(e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor="deck-rule-saved-before"
                    className="block text-sm font-medium text-ink mb-1"
                  >
                    Saved before
                  </label>
                  <input
                    id="deck-rule-saved-before"
                    type="date"
                    value={ruleSavedBefore}
                    onChange={(e) => setRuleSavedBefore(e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
            </fieldset>
          )}

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

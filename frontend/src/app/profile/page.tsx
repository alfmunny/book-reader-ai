"use client";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveGeminiKey, deleteGeminiKey, getMe, getObsidianSettings, saveObsidianSettings, listDecks, DeckSummary } from "@/lib/api";
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, DeckIcon } from "@/components/Icons";
import { getSettings, saveSettings, AppSettings } from "@/lib/settings";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
];

export default function ProfilePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const user = session?.backendUser;

  // ── Gemini key state ───────────────────────────────────────────────────────
  const [keyInput, setKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [removingKey, setRemovingKey] = useState(false);
  const [keyMessage, setKeyMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // ── Obsidian settings state ────────────────────────────────────────────────
  const [obsidianOpen, setObsidianOpen] = useState(false);
  const [obsidianToken, setObsidianToken] = useState("");
  const [hasObsidianToken, setHasObsidianToken] = useState(false);
  const [obsidianRepo, setObsidianRepo] = useState("");
  const [obsidianPath, setObsidianPath] = useState("All Notes/002 Literature Notes/000 Books");
  const [obsidianSaving, setObsidianSaving] = useState(false);
  const [obsidianMsg, setObsidianMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ── Preferences state ──────────────────────────────────────────────────────
  const [settings, setSettings] = useState<AppSettings>({
    insightLang: "en",
    translationLang: "en",
    translationEnabled: false,
    ttsGender: "female",
    chatFontSize: "xs",
    translationProvider: "auto",
    fontSize: "base",
    theme: "light",
    lineHeight: "normal",
    contentWidth: "normal",
    fontFamily: "serif",
    paragraphFocus: false,
  });
  const [prefsSaved, setPrefsSaved] = useState(false);

  // ── Study decks (decks with due cards today) ───────────────────────────────
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [decksLoading, setDecksLoading] = useState(true);

  useEffect(() => {
    document.title = "Profile — Book Reader AI";
  }, []);

  useEffect(() => {
    let alive = true;
    listDecks()
      .then((d) => {
        if (alive) setDecks(d);
      })
      .catch(() => {
        // Swallow — section just hides
      })
      .finally(() => {
        if (alive) setDecksLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function gotoFlashcardsForDeck(deckId: number) {
    try {
      localStorage.setItem("flashcards.lastDeckId", String(deckId));
    } catch {
      /* ignore */
    }
    router.push("/vocabulary/flashcards");
  }

  const dueDecks = decks.filter((d) => d.due_today > 0);

  // Fetch live key status from backend (session JWT can be stale after key changes)
  useEffect(() => {
    getMe().then((me) => {
      setHasKey(me.hasGeminiKey);
      setIsAdmin(me.role === "admin");
    }).catch(() => {});
  }, [session?.backendToken]);

  // Load Obsidian settings
  useEffect(() => {
    if (!session?.backendToken) return;
    getObsidianSettings().then((s) => {
      setObsidianRepo(s.obsidian_repo ?? "");
      setObsidianPath(s.obsidian_path ?? "All Notes/002 Literature Notes/000 Books");
      setHasObsidianToken(s.has_github_token ?? false);
    }).catch(() => {});
  }, [session?.backendToken]);

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  function updatePref<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setPrefsSaved(false);
  }

  function savePreferences() {
    saveSettings(settings);
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 2000);
  }

  async function handleSaveKey() {
    if (!keyInput.trim()) return;
    setSavingKey(true);
    setKeyMessage(null);
    try {
      await saveGeminiKey(keyInput.trim());
      setKeyInput("");
      setHasKey(true);
      setKeyMessage({ text: "Gemini API key saved. AI features now use your key.", ok: true });
    } catch (e: unknown) {
      setKeyMessage({ text: e instanceof Error ? e.message : "Failed to save key", ok: false });
    } finally {
      setSavingKey(false);
    }
  }

  async function handleSaveObsidian() {
    setObsidianSaving(true);
    setObsidianMsg(null);
    try {
      await saveObsidianSettings({
        ...(obsidianToken.trim() ? { github_token: obsidianToken.trim() } : {}),
        obsidian_repo: obsidianRepo.trim(),
        obsidian_path: obsidianPath.trim(),
      });
      if (obsidianToken.trim()) setHasObsidianToken(true);
      setObsidianToken("");
      setObsidianMsg({ text: "Obsidian settings saved.", ok: true });
    } catch (e: unknown) {
      setObsidianMsg({ text: e instanceof Error ? e.message : "Failed to save", ok: false });
    } finally {
      setObsidianSaving(false);
    }
  }

  async function handleRemoveObsidianToken() {
    setObsidianSaving(true);
    setObsidianMsg(null);
    try {
      await saveObsidianSettings({
        github_token: "",
        obsidian_repo: obsidianRepo.trim(),
        obsidian_path: obsidianPath.trim(),
      });
      setHasObsidianToken(false);
      setObsidianMsg({ text: "GitHub token removed.", ok: true });
    } catch (e: unknown) {
      setObsidianMsg({ text: e instanceof Error ? e.message : "Failed to remove token", ok: false });
    } finally {
      setObsidianSaving(false);
    }
  }

  async function handleRemoveKey() {
    setRemovingKey(true);
    setKeyMessage(null);
    try {
      await deleteGeminiKey();
      setHasKey(false);
      setKeyMessage({ text: "Gemini key removed. Translations and TTS will use free services; insights require a key.", ok: true });
    } catch (e: unknown) {
      setKeyMessage({ text: e instanceof Error ? e.message : "Failed to remove key", ok: false });
    } finally {
      setRemovingKey(false);
    }
  }

  return (
    <main id="main-content" className="min-h-screen bg-parchment">
      {/* Header */}
      <header className="border-b border-amber-200 bg-white/70 backdrop-blur px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-amber-700 hover:text-amber-900 text-sm min-h-[44px] flex items-center"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5 mr-1 inline" aria-hidden="true" />Library
        </button>
        <h1 className="font-serif font-bold text-ink">Profile &amp; Settings</h1>
      </header>

      <div className="max-w-lg mx-auto px-6 py-10 space-y-8">
        {/* ── Account ─────────────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-amber-100 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink mb-4">Account</h2>
          <div className="flex items-center gap-4">
            {user?.picture && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.picture}
                alt={user.name}
                className="w-12 h-12 rounded-full"
              />
            )}
            <div>
              <p className="font-medium text-ink">{user?.name}</p>
              <p className="text-sm text-stone-500">{user?.email}</p>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-red-600 hover:text-red-800 min-h-[44px] flex items-center"
            >
              Sign out
            </button>
            {isAdmin && (
              <button
                onClick={() => router.push("/admin")}
                className="text-sm text-amber-700 hover:text-amber-900 underline min-h-[44px] flex items-center"
              >
                Admin Panel
              </button>
            )}
          </div>
        </section>

        {/* ── Study decks (due today) ──────────────────────────────────── */}
        {decksLoading ? (
          <section
            role="status"
            aria-label="Loading study decks"
            className="bg-white rounded-2xl border border-amber-100 p-6"
          >
            <div className="animate-pulse space-y-3" aria-hidden="true">
              <div className="h-5 w-32 bg-amber-100 rounded" />
              <div className="h-12 bg-amber-100 rounded-xl min-h-[44px]" />
              <div className="h-12 bg-amber-100 rounded-xl min-h-[44px]" />
            </div>
          </section>
        ) : dueDecks.length > 0 ? (
          <section className="bg-white rounded-2xl border border-amber-100 p-6">
            <h2 className="font-serif text-lg font-semibold text-ink mb-4">Study decks</h2>
            <ul className="space-y-2">
              {dueDecks.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => gotoFlashcardsForDeck(d.id)}
                    aria-label={`Review ${d.due_today} due card${d.due_today !== 1 ? "s" : ""} in ${d.name}`}
                    className="w-full flex items-center gap-3 rounded-xl border border-amber-200 bg-white px-4 py-2 hover:border-amber-400 hover:bg-amber-50 transition-colors min-h-[44px]"
                  >
                    <DeckIcon className="w-4 h-4 text-amber-700 shrink-0" />
                    <span className="font-serif text-ink truncate flex-1 min-w-0 text-left">
                      {d.name}
                    </span>
                    <span className="text-xs font-medium text-amber-700 shrink-0">
                      {d.due_today} due
                    </span>
                    <ChevronRightIcon className="w-4 h-4 text-stone-400 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Section label */}
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400 px-1">AI &amp; Integrations</h2>

        {/* ── Gemini API key ──────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-amber-100 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink mb-1">Gemini API Key</h2>
          <p className="text-sm text-stone-500 mb-5">
            Add your own key from{" "}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-700 underline"
            >
              Google AI Studio
            </a>{" "}
            for higher-quality translations, insights, chat, and TTS.
            Without a key, translations use Google Translate and TTS uses
            Microsoft Edge voices (both free). The Gemini free tier is
            generous (1M tokens/day).
          </p>

          {hasKey ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <CheckIcon aria-hidden="true" className="w-4 h-4 shrink-0" />
                <span>Gemini key is active — translations, TTS, and insights use Gemini.</span>
              </div>
              <button
                onClick={handleRemoveKey}
                disabled={removingKey}
                className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50 min-h-[44px] flex items-center"
              >
                {removingKey ? "Removing…" : "Remove key"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                aria-label="Gemini API key"
                type="password"
                placeholder="AIza…"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                onClick={handleSaveKey}
                disabled={savingKey || !keyInput.trim()}
                className="rounded-lg bg-amber-700 text-white px-5 py-2 min-h-[44px] text-sm hover:bg-amber-800 disabled:opacity-50 transition-colors"
              >
                {savingKey ? "Saving…" : "Save key"}
              </button>
            </div>
          )}

          {keyMessage && (
            <p role="status" className={`mt-3 text-sm ${keyMessage.ok ? "text-emerald-700" : "text-red-600"}`}>
              {keyMessage.text}
            </p>
          )}
        </section>

        {/* ── Obsidian Export Settings ────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          {/* Accordion header */}
          <button
            onClick={() => setObsidianOpen((o) => !o)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-amber-50/50 transition-colors"
            aria-expanded={obsidianOpen}
            aria-controls="obsidian-export-panel"
          >
            <div>
              <h2 className="font-serif text-lg font-semibold text-ink">Obsidian Export</h2>
              <p className="text-xs text-stone-400 mt-0.5">
                {hasObsidianToken
                  ? "GitHub token configured — vault sync ready"
                  : "Configure GitHub integration to push vocab to Obsidian"}
              </p>
            </div>
            <ChevronRightIcon
              className={`w-4 h-4 text-amber-600 transition-transform duration-200 ${obsidianOpen ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
          </button>

          {/* Collapsible body */}
          {obsidianOpen && (
            <div id="obsidian-export-panel" role="region" aria-label="Obsidian export settings" className="px-6 pb-6 space-y-4 border-t border-amber-100">
              <div className="pt-4">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="obsidian-token" className="block text-sm font-medium text-ink">
                    GitHub Token
                  </label>
                  {hasObsidianToken && (
                    <span className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <CheckIcon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                        Token configured
                      </span>
                      <button
                        onClick={handleRemoveObsidianToken}
                        disabled={obsidianSaving}
                        className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50 min-h-[44px] inline-flex items-center"
                      >
                        Remove
                      </button>
                    </span>
                  )}
                </div>
                <input
                  id="obsidian-token"
                  type="password"
                  placeholder={hasObsidianToken ? "Enter new token to replace existing" : "ghp_… (never shown back)"}
                  value={obsidianToken}
                  onChange={(e) => setObsidianToken(e.target.value)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <p className="text-xs text-stone-400 mt-1">
                  Requires <code>contents:write</code> permission on your vault repo.
                </p>
              </div>

              <div>
                <label htmlFor="obsidian-repo" className="block text-sm font-medium text-ink mb-1">
                  Obsidian Repo
                </label>
                <input
                  id="obsidian-repo"
                  type="text"
                  placeholder="username/obsidian-notes"
                  value={obsidianRepo}
                  onChange={(e) => setObsidianRepo(e.target.value)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label htmlFor="obsidian-path" className="block text-sm font-medium text-ink mb-1">
                  Vault Path
                </label>
                <input
                  id="obsidian-path"
                  type="text"
                  placeholder="All Notes/002 Literature Notes/000 Books"
                  value={obsidianPath}
                  onChange={(e) => setObsidianPath(e.target.value)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <button
                onClick={handleSaveObsidian}
                disabled={obsidianSaving}
                className="rounded-lg bg-amber-700 text-white px-5 py-2 min-h-[44px] text-sm hover:bg-amber-800 disabled:opacity-50 transition-colors"
              >
                {obsidianSaving ? "Saving…" : "Save Obsidian settings"}
              </button>

              {obsidianMsg && (
                <p role="status" className={`text-sm ${obsidianMsg.ok ? "text-emerald-700" : "text-red-600"}`}>
                  {obsidianMsg.text}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Section label */}
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400 px-1">Reader Preferences</h2>

        {/* ── Preferences ─────────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-amber-100 p-6 space-y-6">
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink">Preferences</h2>
            <p className="text-sm text-stone-500 mt-1">
              Defaults applied across the reader. You can still override most of these per-session.
            </p>
          </div>

          {/* Insight & chat language */}
          <div>
            <label htmlFor="pref-insight-lang" className="block text-sm font-medium text-ink mb-1.5">
              Insight &amp; chat language
            </label>
            <select
              id="pref-insight-lang"
              className="w-full rounded-lg border border-amber-300 px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={settings.insightLang}
              onChange={(e) => updatePref("insightLang", e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <p className="text-xs text-stone-500 mt-1">
              Language used for chapter insights and follow-up chat responses.
            </p>
          </div>

          {/* Translation language */}
          <div>
            <label htmlFor="pref-translation-lang" className="block text-sm font-medium text-ink mb-1.5">
              Translation language
            </label>
            <select
              id="pref-translation-lang"
              className="w-full rounded-lg border border-amber-300 px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={settings.translationLang}
              onChange={(e) => updatePref("translationLang", e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <p className="text-xs text-stone-500 mt-1">
              Target language when the translation panel is enabled.
            </p>
          </div>

          {/* TTS voice gender */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Text-to-speech voice
            </label>
            <p className="text-xs text-stone-500 mb-2">
              Uses Microsoft Edge TTS (free, no API key required).
            </p>
            <div className="flex gap-2">
              {(["female", "male"] as const).map((g) => (
                <label
                  key={g}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                    settings.ttsGender === g
                      ? "border-amber-400 bg-amber-50"
                      : "border-amber-200 bg-white hover:bg-amber-50/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="ttsGender"
                    value={g}
                    checked={settings.ttsGender === g}
                    onChange={() => updatePref("ttsGender", g)}
                    className="accent-amber-700"
                  />
                  <span className="text-sm font-medium text-ink capitalize">{g === "female" ? "Female" : "Male"}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Translation provider */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Translation provider
            </label>
            <div className="space-y-2">
              {([
                { value: "auto", label: "Auto", hint: "Use Gemini if a key is set, otherwise Google Translate (free)." },
                { value: "google", label: "Google Translate", hint: "Free, no API key required. Good enough for casual reading." },
                { value: "gemini", label: "Gemini", hint: "Best quality for literary text — preserves style, tone, and poetic structure. Requires a Gemini API key." },
              ] as const).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    settings.translationProvider === opt.value
                      ? "border-amber-400 bg-amber-50"
                      : "border-amber-200 bg-white hover:bg-amber-50/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="translationProvider"
                    value={opt.value}
                    checked={settings.translationProvider === opt.value}
                    onChange={() => updatePref("translationProvider", opt.value)}
                    className="mt-0.5 accent-amber-700"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink">{opt.label}</div>
                    <div className="text-xs text-stone-500 mt-0.5">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Single save button at the bottom of the preferences section */}
          <button
            onClick={savePreferences}
            className={`w-full rounded-lg py-2.5 min-h-[44px] text-sm font-medium transition-colors ${
              prefsSaved
                ? "bg-green-600 text-white"
                : "bg-amber-700 text-white hover:bg-amber-800"
            }`}
          >
            {prefsSaved ? "Saved!" : "Save preferences"}
          </button>
        </section>

      </div>
    </main>
  );
}

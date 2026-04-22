"use client";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveGeminiKey, deleteGeminiKey, getMe, getObsidianSettings, saveObsidianSettings } from "@/lib/api";
import { getSettings, saveSettings, AppSettings } from "@/lib/settings";
import ReadingStats from "@/components/ReadingStats";

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
  });
  const [prefsSaved, setPrefsSaved] = useState(false);

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
    <div className="min-h-screen bg-parchment">
      {/* Header */}
      <header className="border-b border-amber-200 bg-white/70 backdrop-blur px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-amber-700 hover:text-amber-900 text-sm"
        >
          ← Library
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
              className="text-sm text-red-600 hover:text-red-800"
            >
              Sign out
            </button>
            {isAdmin && (
              <button
                onClick={() => router.push("/admin")}
                className="text-sm text-amber-700 hover:text-amber-900 underline"
              >
                Admin Panel
              </button>
            )}
          </div>
        </section>

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
                <span>✓</span>
                <span>Gemini key is active — translations, TTS, and insights use Gemini.</span>
              </div>
              <button
                onClick={handleRemoveKey}
                disabled={removingKey}
                className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                {removingKey ? "Removing…" : "Remove key"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="password"
                placeholder="AIza…"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                onClick={handleSaveKey}
                disabled={savingKey || !keyInput.trim()}
                className="rounded-lg bg-amber-700 text-white px-5 py-2 text-sm hover:bg-amber-800 disabled:opacity-50 transition-colors"
              >
                {savingKey ? "Saving…" : "Save key"}
              </button>
            </div>
          )}

          {keyMessage && (
            <p className={`mt-3 text-sm ${keyMessage.ok ? "text-emerald-700" : "text-red-600"}`}>
              {keyMessage.text}
            </p>
          )}
        </section>

        {/* ── Obsidian Export Settings ────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-amber-100 p-6 space-y-4">
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink mb-1">Obsidian Export</h2>
            <p className="text-sm text-stone-500">
              Configure GitHub integration so vocabulary can be pushed to your Obsidian vault.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-ink">
                GitHub Token
              </label>
              {hasObsidianToken && (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-emerald-600 font-medium">Token configured ✓</span>
                  <button
                    onClick={handleRemoveObsidianToken}
                    disabled={obsidianSaving}
                    className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </span>
              )}
            </div>
            <input
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
            <label className="block text-sm font-medium text-ink mb-1">
              Obsidian Repo
            </label>
            <input
              type="text"
              placeholder="username/obsidian-notes"
              value={obsidianRepo}
              onChange={(e) => setObsidianRepo(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Vault Path
            </label>
            <input
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
            className="rounded-lg bg-amber-700 text-white px-5 py-2 text-sm hover:bg-amber-800 disabled:opacity-50 transition-colors"
          >
            {obsidianSaving ? "Saving…" : "Save Obsidian settings"}
          </button>

          {obsidianMsg && (
            <p className={`text-sm ${obsidianMsg.ok ? "text-emerald-700" : "text-red-600"}`}>
              {obsidianMsg.text}
            </p>
          )}
        </section>

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
            <label className="block text-sm font-medium text-ink mb-1.5">
              Insight &amp; chat language
            </label>
            <select
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
            <label className="block text-sm font-medium text-ink mb-1.5">
              Translation language
            </label>
            <select
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
                  <span className="text-sm font-medium text-ink capitalize">{g === "female" ? "♀ Female" : "♂ Male"}</span>
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
            className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
              prefsSaved
                ? "bg-green-600 text-white"
                : "bg-amber-700 text-white hover:bg-amber-800"
            }`}
          >
            {prefsSaved ? "Saved!" : "Save preferences"}
          </button>
        </section>

        {/* ── Reading Statistics ───────────────────────────────────────────── */}
        {session?.backendToken && (
          <section className="bg-white rounded-2xl border border-amber-100 p-6">
            <h2 className="font-serif text-lg font-semibold text-ink mb-5">Reading Statistics</h2>
            <ReadingStats active={!!session?.backendToken} />
          </section>
        )}
      </div>
    </div>
  );
}

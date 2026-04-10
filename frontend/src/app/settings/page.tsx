"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings>({ insightLang: "en", translationLang: "en" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  function update(key: keyof AppSettings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function save() {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <main className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="text-amber-700 hover:text-amber-900 text-sm"
        >
          ← Back
        </button>
        <h1 className="text-xl font-serif font-bold text-ink">Settings</h1>
      </header>

      <div className="max-w-lg mx-auto px-6 py-10 space-y-6">
        <section className="bg-white rounded-2xl border border-amber-200 p-6 space-y-6">
          <div>
            <h2 className="font-serif font-semibold text-ink text-lg">Language Defaults</h2>
            <p className="text-sm text-amber-700 mt-1">
              Used as the starting language in the reader. You can still switch per-session in the toolbar.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                Insight &amp; Chat language
              </label>
              <select
                className="w-full rounded-lg border border-amber-300 px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={settings.insightLang}
                onChange={(e) => update("insightLang", e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
              <p className="text-xs text-amber-500 mt-1">
                Language used for chapter insights and follow-up chat responses.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                Translation language
              </label>
              <select
                className="w-full rounded-lg border border-amber-300 px-3 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={settings.translationLang}
                onChange={(e) => update("translationLang", e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
              <p className="text-xs text-amber-500 mt-1">
                Target language when the translation panel is enabled.
              </p>
            </div>
          </div>

          <button
            onClick={save}
            className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
              saved
                ? "bg-green-600 text-white"
                : "bg-amber-700 text-white hover:bg-amber-800"
            }`}
          >
            {saved ? "Saved!" : "Save settings"}
          </button>
        </section>
      </div>
    </main>
  );
}

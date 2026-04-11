"use client";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveGeminiKey, deleteGeminiKey, getMe } from "@/lib/api";

export default function ProfilePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const user = session?.backendUser;

  const [keyInput, setKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Fetch live state from backend (session JWT is stale after key changes)
  useEffect(() => {
    if (!session?.backendToken) return;
    getMe().then((me) => setHasKey(me.hasGeminiKey)).catch(() => {});
  }, [session?.backendToken]);

  async function handleSaveKey() {
    if (!keyInput.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveGeminiKey(keyInput.trim());
      setKeyInput("");
      setHasKey(true);
      setMessage({ text: "Gemini API key saved. AI features now use your key.", ok: true });
    } catch (e: unknown) {
      setMessage({ text: e instanceof Error ? e.message : "Failed to save key", ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveKey() {
    setRemoving(true);
    setMessage(null);
    try {
      await deleteGeminiKey();
      setHasKey(false);
      setMessage({ text: "Gemini key removed. AI features will use the app's Claude key.", ok: true });
    } catch (e: unknown) {
      setMessage({ text: e instanceof Error ? e.message : "Failed to remove key", ok: false });
    } finally {
      setRemoving(false);
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
        <h1 className="font-serif font-bold text-ink">Profile</h1>
      </header>

      <div className="max-w-lg mx-auto px-6 py-10 space-y-8">
        {/* Account info */}
        <div className="bg-white rounded-2xl border border-amber-100 p-6">
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
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-6 text-sm text-red-600 hover:text-red-800"
          >
            Sign out
          </button>
        </div>

        {/* Gemini API key */}
        <div className="bg-white rounded-2xl border border-amber-100 p-6">
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
            to use Gemini for translations and insights instead of the app&apos;s Claude key.
            The free tier is very generous (1M tokens/day).
          </p>

          {hasKey ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <span>✓</span>
                <span>Gemini key is active — AI features use your key.</span>
              </div>
              <button
                onClick={handleRemoveKey}
                disabled={removing}
                className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                {removing ? "Removing…" : "Remove key"}
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
                disabled={saving || !keyInput.trim()}
                className="rounded-lg bg-amber-700 text-white px-5 py-2 text-sm hover:bg-amber-800 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : "Save key"}
              </button>
            </div>
          )}

          {message && (
            <p className={`mt-3 text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

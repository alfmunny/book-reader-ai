"use client";
import { useRef, useState, ReactNode } from "react";
import { CheckIcon } from "@/components/Icons";

interface Props {
  /** Unique id stem, e.g. "claude" — used for heading/message element ids. */
  providerId: string;
  /** Section heading, e.g. "Claude API Key". */
  heading: string;
  /** Explanatory copy under the heading. */
  description: ReactNode;
  /** Input placeholder hinting at the key format, e.g. "sk-ant-…". */
  placeholder: string;
  /** Whether a key is currently stored for this provider. */
  hasKey: boolean;
  /** Shown in the green banner while a key is active. */
  activeText: string;
  /** Status message after a successful save. */
  savedText: string;
  /** Status message after a successful remove. */
  removedText: string;
  /** Persist the key; throws on failure. */
  onSave: (key: string) => Promise<unknown>;
  /** Delete the stored key; throws on failure. */
  onRemove: () => Promise<unknown>;
  /** Notify the parent so it can update its hasKey state. */
  onKeyChange: (hasKey: boolean) => void;
}

/**
 * BYOK card for one AI provider on the profile page. Mirrors the Gemini key
 * section's markup and a11y contract (labelled section, aria-live status,
 * error border on failure) without duplicating it per provider.
 */
export default function ProviderKeySection({
  providerId,
  heading,
  description,
  placeholder,
  hasKey,
  activeText,
  savedText,
  removedText,
  onSave,
  onRemove,
  onKeyChange,
}: Props) {
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleSave() {
    if (!keyInput.trim()) return;
    setSaving(true);
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    setMessage(null);
    try {
      await onSave(keyInput.trim());
      setKeyInput("");
      onKeyChange(true);
      setMessage({ text: savedText, ok: true });
      msgTimerRef.current = setTimeout(() => setMessage(null), 3000);
    } catch (e: unknown) {
      setMessage({ text: e instanceof Error ? e.message : "Failed to save key", ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setMessage(null);
    try {
      await onRemove();
      onKeyChange(false);
      setMessage({ text: removedText, ok: true });
    } catch (e: unknown) {
      setMessage({ text: e instanceof Error ? e.message : "Failed to remove key", ok: false });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section aria-labelledby={`profile-${providerId}-heading`} className="bg-white rounded-2xl border border-amber-100 p-6">
      <h2 id={`profile-${providerId}-heading`} className="font-serif text-lg font-semibold text-ink mb-1">{heading}</h2>
      <p className="text-sm text-stone-600 mb-5">{description}</p>

      {hasKey ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <CheckIcon aria-hidden="true" className="w-4 h-4 shrink-0" />
            <span>{activeText}</span>
          </div>
          <button
            onClick={handleRemove}
            disabled={removing}
            className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50 min-h-[44px] md:min-h-0 flex items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
          >
            {removing ? "Removing…" : "Remove key"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            aria-label={heading}
            type="password"
            autoComplete="off"
            placeholder={placeholder}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            aria-invalid={message ? !message.ok : undefined}
            aria-describedby={`${providerId}-key-message`}
            className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 placeholder:text-stone-600 ${message?.ok === false ? "border-red-400 focus:ring-red-400" : "border-stone-300 focus:ring-amber-400"}`}
          />
          <button
            onClick={handleSave}
            disabled={saving || !keyInput.trim()}
            className="rounded-lg bg-amber-700 text-white px-5 py-2 min-h-[44px] md:min-h-0 text-sm hover:bg-amber-800 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
          >
            {saving ? "Saving…" : "Save key"}
          </button>
        </div>
      )}

      <p id={`${providerId}-key-message`} role="status" aria-live="polite" aria-atomic="true" className={`mt-3 text-sm ${message ? (message.ok ? "text-emerald-700" : "text-red-600") : ""}`}>
        {message?.text ?? ""}
      </p>
    </section>
  );
}

export type TTSProvider = "auto" | "edge" | "google";

export interface AppSettings {
  insightLang: string;
  translationLang: string;
  audiobookEnabled: boolean;
  /**
   * Which TTS backend to use for sentence-clicked audio.
   * - "auto"   → Google Gemini TTS if a Gemini key is set, else Edge
   * - "edge"   → always use Microsoft Edge TTS (free, no key)
   * - "google" → always use Google Gemini TTS (requires Gemini key)
   */
  ttsProvider: TTSProvider;
}

const DEFAULTS: AppSettings = {
  insightLang: "en",
  translationLang: "en",
  audiobookEnabled: true,
  ttsProvider: "auto",
};

const KEY = "book-reader-settings";

export function getSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(updates: Partial<AppSettings>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify({ ...getSettings(), ...updates }));
}

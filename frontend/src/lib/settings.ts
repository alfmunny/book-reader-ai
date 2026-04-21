export type TranslationProvider = "auto" | "gemini" | "google";
export type FontSize = "sm" | "base" | "lg" | "xl";
export type ChatFontSize = "xs" | "sm";
export type Theme = "light" | "dark" | "sepia";
export type TTSGender = "female" | "male";

export interface AppSettings {
  insightLang: string;
  translationLang: string;
  ttsGender: TTSGender;
  translationProvider: TranslationProvider;
  fontSize: FontSize;
  chatFontSize: ChatFontSize;
  theme: Theme;
}

const DEFAULTS: AppSettings = {
  insightLang: "en",
  translationLang: "en",
  ttsGender: "female",
  translationProvider: "auto",
  fontSize: "base",
  chatFontSize: "xs",
  theme: "light",
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

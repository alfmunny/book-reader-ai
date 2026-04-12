export type TTSProvider = "auto" | "edge" | "google";
export type FontSize = "sm" | "base" | "lg" | "xl";
export type Theme = "light" | "dark" | "sepia";

export interface AppSettings {
  insightLang: string;
  translationLang: string;
  audiobookEnabled: boolean;
  ttsProvider: TTSProvider;
  fontSize: FontSize;
  theme: Theme;
}

const DEFAULTS: AppSettings = {
  insightLang: "en",
  translationLang: "en",
  audiobookEnabled: true,
  ttsProvider: "auto",
  fontSize: "base",
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

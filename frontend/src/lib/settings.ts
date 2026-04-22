export type TranslationProvider = "auto" | "gemini" | "google";
export type FontSize = "sm" | "base" | "lg" | "xl";
export type ChatFontSize = "xs" | "sm";
export type Theme = "light" | "dark" | "sepia";
export type TTSGender = "female" | "male";
export type LineHeight = "tight" | "normal" | "relaxed";
export type ContentWidth = "narrow" | "normal" | "wide";
export type FontFamily = "serif" | "sans";

export interface AppSettings {
  insightLang: string;
  translationLang: string;
  translationEnabled: boolean;
  ttsGender: TTSGender;
  translationProvider: TranslationProvider;
  fontSize: FontSize;
  chatFontSize: ChatFontSize;
  theme: Theme;
  lineHeight: LineHeight;
  contentWidth: ContentWidth;
  fontFamily: FontFamily;
  paragraphFocus: boolean;
}

const DEFAULTS: AppSettings = {
  insightLang: "en",
  translationLang: "en",
  translationEnabled: false,
  ttsGender: "female",
  translationProvider: "auto",
  fontSize: "base",
  chatFontSize: "xs",
  theme: "light",
  lineHeight: "normal",
  contentWidth: "normal",
  fontFamily: "serif",
  paragraphFocus: false,
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

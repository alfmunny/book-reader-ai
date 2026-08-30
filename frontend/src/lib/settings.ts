export type TranslationProvider = "auto" | "gemini" | "google";
export type ChatProviderSetting = "auto" | "gemini" | "claude" | "deepseek";
export type FontSize = "sm" | "base" | "lg" | "xl";
export type ChatFontSize = "xs" | "sm";
export type Theme = "light" | "dark" | "sepia";
export type TTSGender = "female" | "male";
export type LineHeight = "tight" | "normal" | "relaxed";
export type ContentWidth = "narrow" | "normal" | "wide";
export type FontFamily = "serif" | "sans";
export type ReaderSidebarTab = "toc" | "chat" | "notes" | "vocab" | "translate";
/** Continuous scroll (default) or paginated columns — design: reading-modes.md */
export type ReaderMode = "scroll" | "page";

export interface AppSettings {
  insightLang: string;
  translationLang: string;
  translationEnabled: boolean;
  ttsGender: TTSGender;
  /** @deprecated queue-era editorial provider — no longer read anywhere. */
  translationProvider: TranslationProvider;
  /** Default provider preselected when creating a new translation version. */
  versionProviderDefault: "deepseek" | "claude";
  /** Show other readers' shares inline while reading (phase 2, #2752).
   *  Off by default — reading stays calm unless the reader opts in. */
  showOthersShares: boolean;
  fontSize: FontSize;
  chatFontSize: ChatFontSize;
  chatProvider: ChatProviderSetting;
  chatSuggestionsHidden: boolean;
  theme: Theme;
  lineHeight: LineHeight;
  contentWidth: ContentWidth;
  fontFamily: FontFamily;
  paragraphFocus: boolean;
  // Reader sidebar memory: restored on load so the insight panel reopens
  // where the reader left it (open state restored on desktop only).
  readerSidebarOpen: boolean;
  readerSidebarTab: ReaderSidebarTab;
  /** Scroll or page. Per profile, like every other reading preference. */
  readerMode: ReaderMode;
}

const DEFAULTS: AppSettings = {
  insightLang: "en",
  translationLang: "en",
  translationEnabled: false,
  ttsGender: "female",
  translationProvider: "auto",
  versionProviderDefault: "deepseek",
  showOthersShares: false,
  fontSize: "base",
  chatFontSize: "xs",
  chatProvider: "auto",
  chatSuggestionsHidden: false,
  theme: "light",
  lineHeight: "normal",
  contentWidth: "normal",
  fontFamily: "serif",
  paragraphFocus: false,
  readerSidebarOpen: false,
  readerSidebarTab: "chat",
  readerMode: "scroll",
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

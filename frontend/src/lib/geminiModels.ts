export interface ModelOption {
  value: string;
  label: string;
  note: string;
  rpm: number;
  rpd: number;
  maxOutputTokens: number;
  // `true` = acceptable for literary translation (preserves register,
  // handles metaphor/register). `false` = lite/preview models that drop
  // nuance — still selectable as a last-ditch fallback, but visually
  // de-emphasised in the chain picker.
  recommended: boolean;
}

// Used by QueueTab and BulkTranslateTab. Picking a model auto-applies the
// matching RPM/RPD to the queue settings so admins don't have to guess.
export const GEMINI_MODEL_OPTIONS: ModelOption[] = [
  {
    value: "gemini-2.5-pro",
    label: "gemini-2.5-pro",
    note: "Highest quality — 64K output tokens packs many chapters per batch, offsetting the tiny free-tier RPM. Reserve for books you care most about.",
    rpm: 2,
    rpd: 50,
    maxOutputTokens: 60000,
    recommended: true,
  },
  {
    value: "gemini-2.5-flash",
    label: "gemini-2.5-flash",
    note: "Near-Pro literary quality. Good balance for bulk work — fastest 'recommended' tier model at 10 rpm.",
    rpm: 10,
    rpd: 250,
    maxOutputTokens: 7500,
    recommended: true,
  },
  {
    value: "gemini-2.0-flash",
    label: "gemini-2.0-flash",
    note: "Previous generation, still solid for prose. Generous free-tier — a useful fallback when 2.5 models are exhausted.",
    rpm: 15,
    rpd: 1500,
    maxOutputTokens: 7500,
    recommended: true,
  },
  {
    value: "gemini-2.5-flash-lite",
    label: "gemini-2.5-flash-lite",
    note: "Drops nuance on dialogue and metaphor. Usable only as a last-ditch fallback.",
    rpm: 15,
    rpd: 1000,
    maxOutputTokens: 7500,
    recommended: false,
  },
  {
    value: "gemini-2.0-flash-lite",
    label: "gemini-2.0-flash-lite",
    note: "Lowest quality in the 2.0 line. Not recommended for literature.",
    rpm: 30,
    rpd: 1500,
    maxOutputTokens: 7500,
    recommended: false,
  },
  {
    value: "",
    label: "Default (gemini-3.1-flash-lite-preview)",
    note: "Server default — a lite/preview model. Same one used for chat and insights. Not recommended for literary work; kept for backward compat.",
    rpm: 12,
    rpd: 1400,
    maxOutputTokens: 7500,
    recommended: false,
  },
];

// Conservative fallback when a custom model is typed in — we don't know
// its quota, so we pick something safe.
export const CUSTOM_MODEL_RATE: { rpm: number; rpd: number; maxOutputTokens: number } = {
  rpm: 10,
  rpd: 500,
  maxOutputTokens: 7500,
};

export function rateForModel(model: string): {
  rpm: number;
  rpd: number;
  maxOutputTokens: number;
} {
  const hit = GEMINI_MODEL_OPTIONS.find((o) => o.value === model);
  return hit
    ? { rpm: hit.rpm, rpd: hit.rpd, maxOutputTokens: hit.maxOutputTokens }
    : CUSTOM_MODEL_RATE;
}

export function labelForModel(model: string): string {
  const hit = GEMINI_MODEL_OPTIONS.find((o) => o.value === model);
  return hit?.label || model || "default";
}

export function isRecommended(model: string): boolean {
  const hit = GEMINI_MODEL_OPTIONS.find((o) => o.value === model);
  return hit?.recommended ?? false;
}

// Suggested default chain — all three "Tier 1" models in quality order.
// The worker will try them in this order and advance to the next on 429.
export const DEFAULT_CHAIN: string[] = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

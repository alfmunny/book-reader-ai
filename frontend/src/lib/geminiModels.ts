export interface ModelOption {
  value: string;
  label: string;
  note: string;
}

// Shared between BulkTranslateTab and QueueTab. "Default" leaves model empty
// so the backend picks its compiled-in default. Admins can always type a
// custom model if they want to try something not listed.
export const GEMINI_MODEL_OPTIONS: ModelOption[] = [
  {
    value: "",
    label: "Default (gemini-3.1-flash-lite-preview)",
    note: "Same model used for chat and insights — known to work with your key. Fast and cheap; fine for most translations.",
  },
  {
    value: "gemini-2.5-pro",
    label: "gemini-2.5-pro",
    note: "Highest quality, 64K output tokens per request. Free-tier RPM is low (~2), best for overnight runs with fewer, bigger batches.",
  },
  {
    value: "gemini-2.5-flash",
    label: "gemini-2.5-flash",
    note: "Strong literary quality, 8K output tokens per request. Free-tier has higher RPM than Pro — good balance for bulk work.",
  },
  {
    value: "gemini-2.5-flash-lite",
    label: "gemini-2.5-flash-lite",
    note: "Cheapest and fastest. Lower quality — fine for quick drafts or less demanding target languages.",
  },
  {
    value: "gemini-2.0-flash",
    label: "gemini-2.0-flash",
    note: "Previous generation — widely available, stable quality, generous free-tier limits.",
  },
  {
    value: "gemini-2.0-flash-lite",
    label: "gemini-2.0-flash-lite",
    note: "Lightest model in the 2.0 line. Use if you're hitting rate limits with heavier models.",
  },
];

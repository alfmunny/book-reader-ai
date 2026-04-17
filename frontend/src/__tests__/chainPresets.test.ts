import {
  CHAIN_PRESETS,
  DEFAULT_CHAIN,
  presetMatchingChain,
} from "@/lib/geminiModels";

describe("chain presets", () => {
  it("exposes exactly the three intent-named presets", () => {
    expect(CHAIN_PRESETS.map((p) => p.id)).toEqual([
      "budget",
      "balanced",
      "premium",
    ]);
  });

  it("premium preset matches the app-wide DEFAULT_CHAIN", () => {
    // Keeping the default in sync with the "premium" preset is what makes a
    // fresh admin see "premium" highlighted without having to save anything.
    const premium = CHAIN_PRESETS.find((p) => p.id === "premium")!;
    expect(premium.chain).toEqual(DEFAULT_CHAIN);
  });

  it("presetMatchingChain returns the preset id when chain matches exactly", () => {
    for (const p of CHAIN_PRESETS) {
      expect(presetMatchingChain(p.chain)).toBe(p.id);
    }
  });

  it("returns null for chains that don't match any preset", () => {
    expect(presetMatchingChain(["gemini-3.1-pro"])).toBeNull();
    expect(presetMatchingChain([])).toBeNull();
    expect(
      presetMatchingChain(["gemini-2.5-flash", "gemini-2.5-pro"]),
    ).toBeNull(); // right models, wrong order
  });
});

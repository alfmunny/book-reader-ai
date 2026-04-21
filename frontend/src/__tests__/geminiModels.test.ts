import {
  rateForModel,
  labelForModel,
  isRecommended,
  presetMatchingChain,
  CUSTOM_MODEL_RATE,
} from "@/lib/geminiModels";

describe("rateForModel", () => {
  it("returns known model rates for a known model", () => {
    const r = rateForModel("gemini-2.5-flash");
    expect(r.rpm).toBeGreaterThan(0);
    expect(r.rpd).toBeGreaterThan(0);
  });

  it("returns CUSTOM_MODEL_RATE for an unknown model", () => {
    const r = rateForModel("unknown-model-xyz");
    expect(r).toEqual(CUSTOM_MODEL_RATE);
  });
});

describe("labelForModel", () => {
  it("returns label for a known model", () => {
    expect(labelForModel("gemini-2.5-flash")).toBe("gemini-2.5-flash");
  });

  it("returns the model string itself for an unknown non-empty model", () => {
    expect(labelForModel("my-custom-model")).toBe("my-custom-model");
  });

  it("returns the model string for an unknown model (no hit found)", () => {
    // hit is undefined → hit?.label is undefined → falls to model
    expect(labelForModel("custom-unlisted-model")).toBe("custom-unlisted-model");
  });
});

describe("isRecommended", () => {
  it("returns true for a recommended model", () => {
    expect(isRecommended("gemini-2.5-flash")).toBe(true);
  });

  it("returns false for a non-recommended model", () => {
    expect(isRecommended("gemini-2.5-flash-lite")).toBe(false);
  });

  it("returns false for an unknown model", () => {
    expect(isRecommended("completely-unknown")).toBe(false);
  });
});

describe("presetMatchingChain", () => {
  it("returns null for a chain that matches no preset", () => {
    expect(presetMatchingChain(["gemini-2.5-pro"])).toBeNull();
  });

  it("returns null for a partially-matching chain", () => {
    expect(presetMatchingChain(["gemini-2.5-flash"])).toBeNull();
  });
});

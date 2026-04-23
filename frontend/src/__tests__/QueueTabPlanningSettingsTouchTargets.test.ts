/**
 * Verifies that QueueTab planning and settings buttons meet 44px touch-target requirement.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf-8"
);

describe("QueueTab planning/settings buttons touch targets", () => {
  it("Show plan button has min-h-[44px]", () => {
    expect(src).toMatch(/runPlan[\s\S]{0,300}min-h-\[44px\]/);
  });

  it("Dry run button has min-h-[44px]", () => {
    expect(src).toMatch(/runDryRun[\s\S]{0,300}min-h-\[44px\]/);
  });

  it("auto-translate Save button has min-h-[44px]", () => {
    expect(src).toMatch(/auto_translate_languages[\s\S]{0,400}min-h-\[44px\]/);
  });

  it("API key Save button has min-h-[44px]", () => {
    expect(src).toMatch(/api_key: apiKey[\s\S]{0,300}min-h-\[44px\]/);
  });

  it("Clear API key button has min-h-[44px]", () => {
    expect(src).toMatch(/Clear queue API key[\s\S]{0,200}min-h-\[44px\]/);
  });

  it("model chain add buttons have min-h-[44px]", () => {
    expect(src).toMatch(/GEMINI_MODEL_OPTIONS[\s\S]{0,500}min-h-\[44px\]/);
  });

  it("Add custom model button has min-h-[44px]", () => {
    expect(src).toMatch(/Add custom[\s\S]{0,50}|[\s\S]{0,200}customModel[\s\S]{0,300}min-h-\[44px\]/);
  });

  it("Queue every book button has min-h-[44px]", () => {
    expect(src).toMatch(/Queue every book[\s\S]{0,100}|[\s\S]{0,200}enqueueAll[\s\S]{0,300}min-h-\[44px\]/);
  });
});

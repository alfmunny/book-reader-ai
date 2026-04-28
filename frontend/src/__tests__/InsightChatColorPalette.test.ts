import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../components/InsightChat.tsx"),
  "utf-8"
);

describe("InsightChat — design system color palette (no gray-* tokens)", () => {
  it("must not use bg-gray-* — use bg-stone-* to match warm design palette", () => {
    expect(src).not.toMatch(/\bbg-gray-\d+/);
  });

  it("must not use text-gray-* — use text-stone-* or text-ink", () => {
    expect(src).not.toMatch(/\btext-gray-\d+/);
  });

  it("must not use border-gray-* — use border-stone-* or border-amber-*", () => {
    expect(src).not.toMatch(/\bborder-gray-\d+/);
  });

  it("must not use hover:bg-gray-* or hover:text-gray-*", () => {
    expect(src).not.toMatch(/\bhover:(bg|text)-gray-\d+/);
  });
});

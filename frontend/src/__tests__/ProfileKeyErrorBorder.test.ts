/**
 * Static assertions: Profile page Gemini key input shows error border on failure — closes #2295
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/app/(shell)/profile/page.tsx"),
  "utf8",
);

describe("ProfileKeyErrorBorder", () => {
  it("Gemini key input uses conditional className referencing keyMessage", () => {
    const anchor = src.indexOf('aria-label="Gemini API key"');
    expect(anchor).toBeGreaterThan(0);
    const block = src.slice(anchor, anchor + 600);
    // Conditional class should reference keyMessage via optional chaining
    expect(block).toMatch(/keyMessage\?\.ok/);
  });

  it("error state applies red border class", () => {
    const anchor = src.indexOf('aria-label="Gemini API key"');
    const block = src.slice(anchor, anchor + 600);
    expect(block).toMatch(/border-red/);
  });

  it("error state applies red focus ring class", () => {
    const anchor = src.indexOf('aria-label="Gemini API key"');
    const block = src.slice(anchor, anchor + 600);
    expect(block).toMatch(/ring-red/);
  });
});

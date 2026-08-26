/**
 * Regression test for #2142 — profile button aria-label must include
 * action context ("Profile & Settings"), not just the user's name.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "../components/SiteHeader.tsx"), "utf-8");

describe("Home page profile button aria-label (closes #2142)", () => {
  it("aria-label template includes Profile & Settings alongside user name", () => {
    // Should use a template that concatenates name with a descriptive suffix
    expect(src).toMatch(/aria-label=\{`\$\{.*backendUser.*\}.*Profile.*Settings`\}/);
  });

  it("aria-label does not use name-only pattern", () => {
    // Old bad pattern: aria-label={session?.backendUser?.name ?? "..."}
    // with ONLY the name (no concatenation of action context)
    const badPattern = /aria-label=\{session\?\.backendUser\?\.name\s*\?\?\s*"Profile/;
    expect(src).not.toMatch(badPattern);
  });
});

/**
 * Regression test for #2144 — profile button title tooltip must match
 * the aria-label pattern (include action context, not just the user's name).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "../app/page.tsx"), "utf-8");

test("profile button title includes Profile & Settings (not just user name)", () => {
  // title should use the same template pattern as aria-label
  expect(src).toMatch(/title=\{`\$\{.*backendUser.*\}.*Profile.*Settings`\}/);
});

test("profile button title does not use name-only pattern", () => {
  const badPattern = /title=\{session\?\.backendUser\?\.name\s*\?\?\s*"Profile/;
  expect(src).not.toMatch(badPattern);
});

/**
 * Regression tests for #1255 and #1875:
 * - Profile page feedback messages must have live-region roles so screen readers announce them.
 * - #1875: keyMessage and obsidianMsg containers must be always-present in the DOM (not
 *   conditionally mounted) so AT observes a text-content change, not a new element mount.
 *   Always-present pattern: role="status" aria-live="polite" with text={msg?.text ?? ""}.
 */
import * as fs from "fs";
import * as path from "path";

const profile = fs.readFileSync(
  path.join(__dirname, "../app/profile/page.tsx"),
  "utf8"
);
const reader = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Profile page feedback messages have always-present live-region roles (#1255 #1875)", () => {
  it("keyMessage uses always-present role=status with aria-live (not conditionally mounted)", () => {
    // After #1875 fix: no conditional mount — the element is always in the DOM
    expect(profile).not.toContain("keyMessage &&");
    // The always-present element must have role="status" and aria-live
    const idx = profile.indexOf('keyMessage?.text');
    expect(idx).toBeGreaterThan(-1);
    const region = profile.slice(Math.max(0, idx - 200), idx + 100);
    expect(region).toMatch(/role="status"|role="alert"/);
    expect(region).toContain('aria-live');
  });

  it("obsidianMsg uses always-present role=status with aria-live (not conditionally mounted)", () => {
    // After #1875 fix: no conditional mount
    expect(profile).not.toContain("obsidianMsg &&");
    const idx = profile.indexOf('obsidianMsg?.text');
    expect(idx).toBeGreaterThan(-1);
    const region = profile.slice(Math.max(0, idx - 200), idx + 100);
    expect(region).toMatch(/role="status"|role="alert"/);
    expect(region).toContain('aria-live');
  });
});

describe("Reader obsidian toast has live-region role (closes #1255)", () => {
  it("obsidianToast container has role=status", () => {
    const idx = reader.indexOf("obsidianToast &&");
    expect(idx).toBeGreaterThan(-1);
    const region = reader.slice(idx, idx + 300);
    expect(region).toContain('role="status"');
  });
});

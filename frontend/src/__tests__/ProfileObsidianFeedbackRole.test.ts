/**
 * Regression tests for #1255: profile page feedback messages and reader
 * obsidian toast must have live-region roles so screen readers announce them.
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

describe("Profile page feedback messages have live-region roles (closes #1255)", () => {
  it("keyMessage paragraph has role=status or role=alert", () => {
    const idx = profile.indexOf("keyMessage &&");
    expect(idx).toBeGreaterThan(-1);
    const region = profile.slice(idx, idx + 300);
    expect(region).toMatch(/role="status"|role="alert"/);
  });

  it("obsidianMsg paragraph has role=status or role=alert", () => {
    const idx = profile.indexOf("obsidianMsg &&");
    expect(idx).toBeGreaterThan(-1);
    const region = profile.slice(idx, idx + 300);
    expect(region).toMatch(/role="status"|role="alert"/);
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

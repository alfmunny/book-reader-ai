/**
 * Source-level regression tests for reader translation queue and login-required
 * banners missing role="status" (issue #2445 — WCAG 4.1.3).
 */
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader page — dynamic banners must have role=status (issue #2445)", () => {
  it("translation queue banner has role=status", () => {
    // Find the translation queue banner region
    const idx = SOURCE.indexOf("Translation queued");
    expect(idx).toBeGreaterThan(-1);
    // role="status" must appear within 350 chars before the text
    const context = SOURCE.slice(Math.max(0, idx - 350), idx + 50);
    expect(context).toMatch(/role="status"/);
  });

  it("login required banner has role=status", () => {
    const idx = SOURCE.indexOf("login required");
    expect(idx).toBeGreaterThan(-1);
    // Find the rendered banner text (not the state value comparison)
    const loginBannerIdx = SOURCE.indexOf("Translation requires an account");
    expect(loginBannerIdx).toBeGreaterThan(-1);
    const context = SOURCE.slice(Math.max(0, loginBannerIdx - 200), loginBannerIdx + 50);
    expect(context).toMatch(/role="status"/);
  });
});

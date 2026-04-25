/**
 * Regression tests for #1245: reader page disclosure buttons must have
 * aria-expanded, and the mobile chat sheet must have role="dialog".
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader page disclosure button aria-expanded (closes #1245)", () => {
  it("Typography settings button has aria-expanded", () => {
    const idx = src.indexOf('aria-label="Typography settings"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("aria-expanded");
  });

  it("Notes button has aria-expanded", () => {
    const idx = src.indexOf('aria-label="Notes"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 100);
    expect(window).toContain("aria-expanded");
  });

  it("Insight chat button has aria-expanded", () => {
    const idx = src.indexOf('aria-label="Insight chat"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 100);
    expect(window).toContain("aria-expanded");
  });
});

describe("Mobile chat sheet role=dialog (closes #1245)", () => {
  it("chat sheet inner div has role=dialog", () => {
    const idx = src.indexOf("Chat sheet (bottom half)");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain('role="dialog"');
  });

  it("chat sheet inner div has aria-modal", () => {
    const idx = src.indexOf("Chat sheet (bottom half)");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain('aria-modal="true"');
  });

  it("chat sheet inner div has aria-label", () => {
    const idx = src.indexOf("Chat sheet (bottom half)");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain('aria-label="Chat"');
  });
});

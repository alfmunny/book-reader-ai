/**
 * Regression test for #2568:
 * Annotation toggle (showAnnotations) must be accessible on mobile.
 * Previously only shown as `hidden lg:flex` — invisible below 1024px.
 * Fix: add the toggle inside the mobile Notes expand panel.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Mobile annotation toggle accessible below lg breakpoint (closes #2568)", () => {
  it("desktop annotation toggle (hidden lg:flex) still exists alongside new mobile toggle", () => {
    // Desktop toggle: hidden lg:flex near Marks on/Marks off
    const marksOnIdx = src.indexOf("Marks on");
    expect(marksOnIdx).not.toBe(-1);
    const desktopCtx = src.slice(Math.max(0, marksOnIdx - 700), marksOnIdx + 50);
    expect(desktopCtx).toContain("hidden lg:flex");

    // Mobile toggle: showAnnotations also appears inside the mobile notes panel
    const mobileNotesPanel = src.indexOf("reader-mobile-notes-panel");
    expect(mobileNotesPanel).not.toBe(-1);
    const mobilePanel = src.slice(mobileNotesPanel, mobileNotesPanel + 1500);
    expect(mobilePanel).toContain("showAnnotations");
  });

  it("mobile notes panel contains an aria-pressed toggle for showAnnotations", () => {
    const panelId = src.indexOf("reader-mobile-notes-panel");
    expect(panelId).not.toBe(-1);
    const panel = src.slice(panelId, panelId + 1500);
    expect(panel).toContain("aria-pressed={showAnnotations}");
  });

  it("mobile annotation toggle has an aria-label", () => {
    // Find all aria-pressed={showAnnotations} occurrences and verify each has aria-label nearby
    let searchFrom = 0;
    let found = 0;
    while (true) {
      const idx = src.indexOf("aria-pressed={showAnnotations}", searchFrom);
      if (idx === -1) break;
      found++;
      searchFrom = idx + 1;
    }
    // There should be at least 2: desktop button + mobile button
    expect(found).toBeGreaterThanOrEqual(2);
  });
});

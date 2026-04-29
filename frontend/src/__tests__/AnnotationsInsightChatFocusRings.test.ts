/**
 * Regression tests for #2196: focus-visible rings on AnnotationsSidebar and InsightChat buttons.
 */
import * as fs from "fs";
import * as path from "path";

const sidebarSrc = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8"
);

const chatSrc = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8"
);

describe("AnnotationsSidebar focus rings (closes #2196)", () => {
  it("Toggle notes panel button has focus ring", () => {
    // className comes after aria-label — look forward
    const idx = sidebarSrc.indexOf("Toggle notes panel");
    expect(idx).toBeGreaterThan(-1);
    const window = sidebarSrc.slice(idx, idx + 350);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Close annotations sidebar button has focus ring", () => {
    const idx = sidebarSrc.indexOf("Close annotations sidebar");
    expect(idx).toBeGreaterThan(-1);
    const window = sidebarSrc.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Edit annotation button has focus ring", () => {
    const idx = sidebarSrc.indexOf("Edit annotation:");
    expect(idx).toBeGreaterThan(-1);
    const window = sidebarSrc.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("InsightChat focus rings (closes #2196)", () => {
  it("Save to notes button has focus ring", () => {
    // className comes after the save-key text — look forward
    const idx = chatSrc.indexOf("Save to notes");
    expect(idx).toBeGreaterThan(-1);
    const window = chatSrc.slice(idx, idx + 220);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Toggle context more/less button has focus ring", () => {
    const idx = chatSrc.indexOf("Toggle context");
    expect(idx).toBeGreaterThan(-1);
    const window = chatSrc.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

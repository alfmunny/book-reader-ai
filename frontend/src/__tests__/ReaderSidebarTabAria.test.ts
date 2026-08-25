/**
 * Regression test for #1862 — reader sidebar panel buttons used aria-expanded
 * (correct for accordion/disclosure) instead of aria-pressed (correct for
 * toggle buttons that open a specific panel). Screens readers were announcing
 * a false "expanded/collapsed" state when the user switched between panels
 * while the sidebar stayed open.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(process.cwd(), "src/app/reader/[bookId]/page.tsx"),
  "utf-8"
);

const SIDEBAR_TABS = ["chat", "translate", "notes", "vocab"] as const;

describe("Reader sidebar panel toggle buttons", () => {
  it("uses aria-pressed (not aria-expanded) on sidebar panel buttons", () => {
    // Each of the 5 panel buttons should expose aria-pressed
    for (const tab of SIDEBAR_TABS) {
      // Look for aria-pressed being set near setSidebarTab("<tab>")
      const ariaPressed = new RegExp(`setSidebarTab\\("${tab}"\\)[\\s\\S]{0,400}aria-pressed`);
      expect(src).toMatch(ariaPressed);
    }
  });

  it("does not use aria-expanded on sidebar panel toggle buttons", () => {
    // aria-expanded must NOT appear paired with setSidebarTab calls
    // (those should now use aria-pressed)
    const badPattern = /setSidebarTab\("[^"]+"\)[\s\S]{0,400}aria-expanded/;
    expect(src).not.toMatch(badPattern);
  });
});

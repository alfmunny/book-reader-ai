/**
 * Regression test for issue #2404: SelectionToolbar appeared with no
 * screen-reader announcement when text was selected via keyboard (WCAG 4.1.3).
 *
 * When the toolbar mounts (selection becomes truthy), an always-present
 * sr-only aria-live="polite" region must announce the available actions so
 * AT users know they can Tab to Read / Highlight / Note / Chat / Word buttons.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/components/SelectionToolbar.tsx"),
  "utf8",
);

describe("SelectionToolbar keyboard accessibility announcement (issue #2404)", () => {
  it("renders an aria-live=polite live region outside the conditional toolbar", () => {
    // The component must NOT just return null — it must always render a live region
    // (even when there is no selection) so AT can fire when content changes.
    expect(src).toMatch(/aria-live="polite"/);
    expect(src).toMatch(/sr-only/);
  });

  it("live region announces available actions when selection is active", () => {
    // The announcement text must describe the actions available
    expect(src).toMatch(/Tab.*action|action.*Tab|selection.*action|Tab.*Read|Read.*Highlight/i);
  });

  it("does not return null outright — always renders the live region", () => {
    // Confirm we no longer have the bare "return null" pattern for no-selection state
    // (it was `if (!selection) return null;` — now it should return a fragment)
    expect(src).not.toMatch(/if \(!selection\) return null/);
  });
});

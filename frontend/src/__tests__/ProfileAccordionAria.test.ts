/**
 * Static assertions: Profile Obsidian accordion has aria-controls + panel id + region role.
 * Closes #1139
 */
import fs from "fs";
import path from "path";

const page = fs.readFileSync(
  path.join(process.cwd(), "src/app/profile/page.tsx"),
  "utf8",
);

describe("Profile accordion ARIA", () => {
  it("toggle button has aria-controls pointing to the panel id", () => {
    expect(page).toContain('aria-controls="obsidian-export-panel"');
  });

  it("collapsible body has id=obsidian-export-panel", () => {
    expect(page).toContain('id="obsidian-export-panel"');
  });

  it("collapsible body has role=region", () => {
    // Scope to the Obsidian section
    const idx = page.indexOf('id="obsidian-export-panel"');
    expect(idx).toBeGreaterThan(0);
    const block = page.slice(Math.max(0, idx - 200), idx + 200);
    expect(block).toContain('role="region"');
  });
});

/**
 * Regression test for #2396 (supersedes the aria-invalid assertions from #2364).
 *
 * #2364 added aria-invalid to all three Obsidian fields to associate error state.
 * #2396 identified this as a WCAG 1.3.1 violation: aria-invalid must only appear
 * on a field whose *value* is invalid.  A generic network/API save failure is not
 * a per-field validation error.  The role="status" region (id="obsidian-msg") is
 * the correct communication channel for form-level errors; aria-describedby links
 * each field to that region so screen readers can still navigate to the message.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/profile/page.tsx"),
  "utf8",
);

describe("Profile Obsidian inputs — aria-invalid removed, aria-describedby kept (closes #2396)", () => {
  it("obsidian-token input does NOT carry aria-invalid", () => {
    const idx = src.indexOf('id="obsidian-token"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).not.toMatch(/aria-invalid/);
  });

  it("obsidian-repo input does NOT carry aria-invalid", () => {
    const idx = src.indexOf('id="obsidian-repo"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).not.toMatch(/aria-invalid/);
  });

  it("obsidian-path input does NOT carry aria-invalid", () => {
    const idx = src.indexOf('id="obsidian-path"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).not.toMatch(/aria-invalid/);
  });

  it("obsidian status message has id=obsidian-msg for aria-describedby", () => {
    expect(src).toMatch(/id="obsidian-msg"/);
  });

  it("obsidian status message has role=status for screen reader announcement", () => {
    const idx = src.indexOf('id="obsidian-msg"');
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/role="status"/);
  });

  it("obsidian-token input references obsidian-msg via aria-describedby", () => {
    const idx = src.indexOf('id="obsidian-token"');
    const block = src.slice(idx, idx + 600);
    expect(block).toContain('aria-describedby="obsidian-msg"');
  });

  it("obsidian-repo input references obsidian-msg via aria-describedby", () => {
    const idx = src.indexOf('id="obsidian-repo"');
    const block = src.slice(idx, idx + 600);
    expect(block).toContain('aria-describedby="obsidian-msg"');
  });
});

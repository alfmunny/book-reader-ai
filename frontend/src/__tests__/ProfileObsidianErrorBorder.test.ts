/**
 * Updated for #2396: per-field red borders removed from Obsidian inputs.
 *
 * Previously (#2296) each field conditionally toggled border-red-400 on save
 * failure.  #2396 removes that because:
 *   1. The error is form-level (network/API), not per-field — red borders
 *      mislead users into thinking their input values are wrong.
 *   2. The role="status" region (id="obsidian-msg") already communicates the
 *      error with colour + text; duplicating it on every field is redundant.
 *
 * Fields now use unconditional border-stone-300 / focus:ring-amber-400.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/app/(shell)/profile/page.tsx"),
  "utf8",
);

describe("ProfileObsidianErrorBorder (updated for #2396)", () => {
  it("obsidian-token input uses static border classes, not conditional red on error", () => {
    const anchor = src.indexOf('id="obsidian-token"');
    expect(anchor).toBeGreaterThan(0);
    const block = src.slice(anchor, anchor + 900);
    expect(block).toMatch(/border-stone-300/);
    expect(block).not.toMatch(/border-red/);
  });

  it("obsidian-repo input uses static border classes, not conditional red on error", () => {
    const anchor = src.indexOf('id="obsidian-repo"');
    expect(anchor).toBeGreaterThan(0);
    const block = src.slice(anchor, anchor + 900);
    expect(block).toMatch(/border-stone-300/);
    expect(block).not.toMatch(/border-red/);
  });

  it("obsidian-path input uses static border classes, not conditional red on error", () => {
    const anchor = src.indexOf('id="obsidian-path"');
    expect(anchor).toBeGreaterThan(0);
    const block = src.slice(anchor, anchor + 900);
    expect(block).toMatch(/border-stone-300/);
    expect(block).not.toMatch(/border-red/);
  });

  it("error is still communicated via obsidian-msg status region", () => {
    expect(src).toMatch(/id="obsidian-msg"[^>]*role="status"/);
  });
});

/**
 * Regression test for #2364: Obsidian form inputs in profile/page.tsx were
 * missing aria-invalid and aria-describedby — screen readers had no way to
 * associate the error state with the field when focus returned to it.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/profile/page.tsx"),
  "utf8",
);

describe("Profile Obsidian inputs aria-invalid (closes #2364)", () => {
  it('obsidian-token input has aria-invalid', () => {
    const idx = src.indexOf('id="obsidian-token"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/aria-invalid/);
  });

  it('obsidian-repo input has aria-invalid', () => {
    const idx = src.indexOf('id="obsidian-repo"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/aria-invalid/);
  });

  it('obsidian-path input has aria-invalid', () => {
    const idx = src.indexOf('id="obsidian-path"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/aria-invalid/);
  });

  it('obsidian status message has an id for aria-describedby', () => {
    expect(src).toMatch(/id="obsidian-msg"/);
  });

  it('obsidian-token input references obsidian-msg via aria-describedby', () => {
    const idx = src.indexOf('id="obsidian-token"');
    const block = src.slice(idx, idx + 600);
    expect(block).toContain('aria-describedby="obsidian-msg"');
  });
});

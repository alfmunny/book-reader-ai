/**
 * Static assertions: Profile Obsidian inputs show red border on save failure — closes #2296
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/app/profile/page.tsx"),
  "utf8",
);

describe("ProfileObsidianErrorBorder", () => {
  it("Obsidian token input className references obsidianMsg", () => {
    const anchor = src.indexOf('id="obsidian-token"');
    expect(anchor).toBeGreaterThan(0);
    const block = src.slice(anchor, anchor + 900);
    expect(block).toMatch(/obsidianMsg/);
  });

  it("Obsidian token input has red border class on error", () => {
    const anchor = src.indexOf('id="obsidian-token"');
    const block = src.slice(anchor, anchor + 900);
    expect(block).toMatch(/border-red/);
  });

  it("Obsidian repo input has red border class on error", () => {
    const anchor = src.indexOf('id="obsidian-repo"');
    expect(anchor).toBeGreaterThan(0);
    const block = src.slice(anchor, anchor + 900);
    expect(block).toMatch(/border-red/);
  });

  it("Obsidian path input has red border class on error", () => {
    const anchor = src.indexOf('id="obsidian-path"');
    expect(anchor).toBeGreaterThan(0);
    const block = src.slice(anchor, anchor + 900);
    expect(block).toMatch(/border-red/);
  });
});

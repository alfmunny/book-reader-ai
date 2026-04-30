/**
 * Source-level regression tests for profile page Obsidian settings fetch error (issue #2424).
 */
import fs from "fs";
import path from "path";

const SOURCE_PATH = path.resolve(__dirname, "../app/profile/page.tsx");
const SOURCE = fs.readFileSync(SOURCE_PATH, "utf8");

describe("Profile page — Obsidian settings fetch error state (issue #2424)", () => {
  it("declares obsidianFetchError state", () => {
    expect(SOURCE).toMatch(/obsidianFetchError/);
  });

  it("declares obsidianRetryTick state", () => {
    expect(SOURCE).toMatch(/obsidianRetryTick/);
  });

  it("sets obsidianFetchError on getObsidianSettings rejection (no silent swallow)", () => {
    // Find the Load Obsidian settings useEffect block
    const effectStart = SOURCE.indexOf("// Load Obsidian settings");
    expect(effectStart).toBeGreaterThan(0);
    const effectEnd = SOURCE.indexOf("}, [session?.backendToken", effectStart);
    const effectBlock = SOURCE.slice(effectStart, effectEnd + 80);
    expect(effectBlock).toMatch(/setObsidianFetchError\s*\(\s*true\s*\)/);
  });

  it("renders error UI with retry when obsidianFetchError is true", () => {
    expect(SOURCE).toMatch(/Couldn(?:&apos;|')t load|[Ff]ailed to load|[Ee]rror loading/);
    expect(SOURCE).toMatch(/setObsidianRetryTick/);
  });

  it("obsidianRetryTick is included in the getObsidianSettings useEffect dependency array", () => {
    const effectStart = SOURCE.indexOf("// Load Obsidian settings");
    expect(effectStart).toBeGreaterThan(0);
    const depsStart = SOURCE.indexOf("}, [session?.backendToken", effectStart);
    const depsStr = SOURCE.slice(depsStart, depsStart + 80);
    expect(depsStr).toMatch(/obsidianRetryTick/);
  });
});

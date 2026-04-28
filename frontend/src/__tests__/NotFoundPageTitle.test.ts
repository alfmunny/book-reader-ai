import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(process.cwd(), "src/app/not-found.tsx"),
  "utf-8"
);

describe("not-found page metadata (WCAG 2.4.2)", () => {
  it("exports a metadata object with a title", () => {
    expect(src).toMatch(/export\s+(const\s+metadata|{\s*metadata\s*})/);
    expect(src).toMatch(/title/);
  });

  it("title is descriptive (mentions not found)", () => {
    const match = src.match(/title[^:]*:\s*["']([^"']+)["']/);
    expect(match).not.toBeNull();
    const title = match![1].toLowerCase();
    expect(title).toMatch(/not.found|404|missing/);
  });
});

/**
 * Static assertion: globals.css overrides iOS default tap-highlight color
 * with a semi-transparent amber that matches the design palette.
 * Closes #1219
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("iOS tap-highlight palette override", () => {
  const css = read("src/app/globals.css");

  it("declares -webkit-tap-highlight-color globally", () => {
    expect(css).toMatch(/-webkit-tap-highlight-color:/);
  });

  it("uses an amber-tinted rgba (matches design palette)", () => {
    // amber-300 is rgb(252, 211, 77); accept any semi-transparent amber tint
    expect(css).toMatch(/-webkit-tap-highlight-color:\s*rgba\(\s*25[0-2],\s*21[0-2],\s*7[5-9],\s*0?\.[0-9]+\s*\)/);
  });
});

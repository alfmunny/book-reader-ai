/**
 * Static assertion: globals.css honours prefers-reduced-motion: reduce.
 * Closes #1213
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Reduced-motion CSS support", () => {
  const css = read("src/app/globals.css");

  it("declares a prefers-reduced-motion media block", () => {
    expect(css).toMatch(/@media[^{]*prefers-reduced-motion:\s*reduce/);
  });

  it("nullifies animation duration under reduced motion", () => {
    expect(css).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });

  it("nullifies transition duration under reduced motion", () => {
    expect(css).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  });

  it("forces auto scroll-behavior under reduced motion", () => {
    expect(css).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });
});

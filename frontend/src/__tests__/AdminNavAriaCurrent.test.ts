/**
 * Static assertion: admin layout nav tabs set aria-current=page on the active tab.
 * Closes #1215
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Admin nav aria-current", () => {
  it("active tab Link sets aria-current=page", () => {
    const src = read("src/app/admin/layout.tsx");
    expect(src).toMatch(/aria-current=\{current === key \? ["']page["'] : undefined\}/);
  });
});

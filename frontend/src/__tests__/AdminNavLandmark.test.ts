/**
 * Static assertion: admin layout wraps its tab strip in a <nav> landmark
 * with an accessible name.
 * Closes #1217
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Admin tab strip landmark", () => {
  it("admin/layout.tsx wraps tabs in <nav aria-label=...>", () => {
    const src = read("src/app/admin/layout.tsx");
    expect(src).toMatch(/<nav\b[^>]*aria-label=["']Admin sections["']/);
  });
});

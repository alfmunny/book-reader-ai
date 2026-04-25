/**
 * Static assertion: admin layout's <main> has id=main-content so the
 * skip-link from app/layout.tsx works on /admin/* routes.
 * Closes #1205
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Admin layout skip-link target", () => {
  it("admin/layout.tsx <main> has id=main-content", () => {
    const src = read("src/app/admin/layout.tsx");
    expect(src).toContain('id="main-content"');
    expect(src).toMatch(/<main\b[^>]*id=["']main-content["']/);
  });
});

import * as fs from "fs";
import * as path from "path";

function readPage(rel: string) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

function hasRoleAlertNearError(src: string): boolean {
  // Find error-styled divs and check they have role="alert" within 50 chars before
  const matches = [...src.matchAll(/role="alert"[^>]*>|<div\s[^>]*role="alert"[^>]*>/g)];
  return matches.length > 0;
}

describe("Admin page error messages have role=\"alert\" (closes #1040)", () => {
  it("admin/books error div has role=\"alert\"", () => {
    const src = readPage("../app/admin/books/page.tsx");
    // Find the dynamic error render: {error && <div ...>
    const idx = src.indexOf("{error &&");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toMatch(/role="alert"/);
  });

  it("admin/uploads error div has role=\"alert\"", () => {
    const src = readPage("../app/admin/uploads/page.tsx");
    const idx = src.indexOf("{error &&");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toMatch(/role="alert"/);
  });

  it("admin/users error div has role=\"alert\"", () => {
    const src = readPage("../app/admin/users/page.tsx");
    // This one returns early: return <div>error</div>
    const idx = src.indexOf("bg-red-50");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 100), idx + 100);
    expect(window).toMatch(/role="alert"/);
  });

  it("admin/audio error div has role=\"alert\"", () => {
    const src = readPage("../app/admin/audio/page.tsx");
    const idx = src.indexOf("bg-red-50");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 100), idx + 100);
    expect(window).toMatch(/role="alert"/);
  });
});

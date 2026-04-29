import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../components/SelectionToolbar.tsx"),
  "utf8",
);

describe("SelectionToolbar button focus rings (closes #2160)", () => {
  it("btnClass includes a focus-visible ring for WCAG 2.4.7", () => {
    expect(src).toMatch(/btnClass\s*=\s*["'][^"']*focus-visible:ring-2[^"']*/);
  });

  it("btnClass does not silently suppress focus with only outline-none", () => {
    // If outline-none is present, a ring must accompany it
    expect(src).not.toMatch(/btnClass\s*=\s*["'][^"']*focus:outline-none(?![^"']*focus-visible:ring)/);
  });
});

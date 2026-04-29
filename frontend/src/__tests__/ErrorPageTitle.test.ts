import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../app/error.tsx"),
  "utf8",
);

describe("error.tsx document title (closes #2156)", () => {
  it("sets document.title via useEffect for WCAG 2.4.2", () => {
    expect(src).toMatch(/useEffect/);
    expect(src).toMatch(/document\.title\s*=\s*["']Error/);
  });

  it("resets document.title on unmount so recovery navigates cleanly", () => {
    expect(src).toMatch(/return\s*\(\)\s*=>\s*\{\s*document\.title\s*=/);
  });
});

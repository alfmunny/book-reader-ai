import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../app/page.tsx"),
  "utf8",
);

describe("home page tabpanel focus rings (closes #2158)", () => {
  it("tabpanel-library has a focus-visible ring for WCAG 2.4.7", () => {
    expect(src).toMatch(/tabpanel-library[^>]*focus-visible:ring-2/);
  });

  it("tabpanel-discover has a focus-visible ring for WCAG 2.4.7", () => {
    expect(src).toMatch(/tabpanel-discover[^>]*focus-visible:ring-2/);
  });

  it("tabpanel-library does not silently suppress all focus indicators", () => {
    // outline-none alone (without a replacement ring) is the violation
    expect(src).not.toMatch(/tabpanel-library[^>]*focus:outline-none(?![^>]*focus-visible:ring)/);
  });

  it("tabpanel-discover does not silently suppress all focus indicators", () => {
    expect(src).not.toMatch(/tabpanel-discover[^>]*focus:outline-none(?![^>]*focus-visible:ring)/);
  });
});

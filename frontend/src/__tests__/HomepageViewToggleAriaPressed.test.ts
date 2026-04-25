import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8",
);

describe("homepage popular books view toggle aria-pressed (issue #1285)", () => {
  it("adds aria-pressed to grid view button", () => {
    expect(src).toMatch(/aria-pressed=\{popularView === "grid"\}/);
  });

  it("adds aria-pressed to list view button", () => {
    expect(src).toMatch(/aria-pressed=\{popularView === "list"\}/);
  });
});

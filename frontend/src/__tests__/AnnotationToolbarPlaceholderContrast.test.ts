import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationToolbar.tsx"),
  "utf8",
);

describe("AnnotationToolbar placeholder contrast (closes #1416)", () => {
  it("note textarea does not use placeholder:text-stone-300", () => {
    // text-stone-300 on white = 1.50:1 — barely visible.
    expect(src).not.toMatch(/placeholder:text-stone-300/);
  });
});

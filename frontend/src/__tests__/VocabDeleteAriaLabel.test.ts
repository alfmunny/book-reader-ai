import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/page.tsx"),
  "utf8"
);

describe("vocabulary delete button aria-label (issue #1269)", () => {
  it("delete button has aria-label including the word", () => {
    expect(src).toMatch(/aria-label=\{`Delete \$\{f\.word\}`\}/);
  });
});

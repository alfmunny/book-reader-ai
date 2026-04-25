import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/TypographyPanel.tsx"),
  "utf8"
);

describe("TypographyPanel Escape key dismiss (closes #1305)", () => {
  it("listens for Escape keydown", () => {
    expect(src).toContain('e.key === "Escape"');
  });
});

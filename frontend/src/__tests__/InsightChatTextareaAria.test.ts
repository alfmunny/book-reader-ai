import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8"
);

describe("InsightChat message textarea has aria-label (closes #1031)", () => {
  it("chat textarea element exists", () => {
    const idx = src.indexOf("<textarea");
    expect(idx).toBeGreaterThan(-1);
  });

  it("chat textarea has aria-label attribute", () => {
    const idx = src.indexOf("<textarea");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 400);
    expect(window).toMatch(/aria-label=/);
  });
});

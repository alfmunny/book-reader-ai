import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/TTSControls.tsx"),
  "utf8"
);

describe("TTSControls loading preview title tooltip", () => {
  it("loading preview paragraph has title attribute near truncate class", () => {
    const anchor = src.indexOf("loadingState.preview}…");
    expect(anchor).toBeGreaterThan(-1);
    const window = src.slice(anchor - 150, anchor + 80);
    expect(window).toContain("title={loadingState.preview}");
  });
});

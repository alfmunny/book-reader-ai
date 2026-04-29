import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationToolbar.tsx"),
  "utf8"
);

describe("AnnotationToolbar quoted sentence title tooltip", () => {
  it("sentence paragraph has a title attribute near line-clamp-2", () => {
    const anchor = src.indexOf("line-clamp-2");
    expect(anchor).toBeGreaterThan(-1);
    // title= appears on the same element, before the className containing line-clamp-2
    const window = src.slice(anchor - 120, anchor + 80);
    expect(window).toContain("title=");
  });
});

import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8"
);

describe("AnnotationsSidebar annotation card title tooltip", () => {
  it("role=button annotation card has title attribute near line-clamp-3", () => {
    const anchor = src.indexOf("line-clamp-3");
    expect(anchor).toBeGreaterThan(-1);
    // Look backward from line-clamp-3 to find the role="button" wrapper with title=
    const surrounding = src.slice(anchor - 900, anchor + 50);
    expect(surrounding).toContain('title=');
  });
});

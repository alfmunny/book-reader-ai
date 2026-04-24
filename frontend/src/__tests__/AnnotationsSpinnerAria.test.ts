import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8",
);

describe("AnnotationsSidebar loading spinners have accessible labels (closes #1057)", () => {
  it("has role=\"status\" on at least one loading container", () => {
    expect(src).toMatch(/role="status"/);
  });

  it("has sr-only or aria-label text for loading state", () => {
    expect(src).toMatch(/sr-only|aria-label="[^"]*[Ll]oad/);
  });
});

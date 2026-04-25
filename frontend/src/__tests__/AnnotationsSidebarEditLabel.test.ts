import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8"
);

describe("AnnotationsSidebar edit button has unique aria-label per annotation (closes #1320)", () => {
  it("edit button aria-label includes sentence text", () => {
    expect(src).toMatch(/aria-label=\{`Edit annotation: \$\{ann\.sentence_text\.slice/);
  });

  it("does not use generic static aria-label for edit button", () => {
    expect(src).not.toContain('aria-label="Edit annotation"');
  });
});

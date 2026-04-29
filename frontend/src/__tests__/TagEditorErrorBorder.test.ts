// Regression: tag input must show red border when error state is set (#2302)
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/TagEditor.tsx"),
  "utf8"
);

describe("TagEditor — tag input error border", () => {
  it("uses conditional border class on error", () => {
    const anchor = src.indexOf("aria-invalid={!!error}");
    expect(anchor).toBeGreaterThan(-1);
    const window = src.slice(anchor, anchor + 350);
    expect(window).toContain("border-red");
  });

  it("does not use static border-amber-300 alone on the tag input", () => {
    const anchor = src.indexOf("aria-invalid={!!error}");
    const window = src.slice(anchor, anchor + 350);
    expect(window).not.toMatch(/className="[^"]*border border-amber-300[^"]*"/);
  });
});

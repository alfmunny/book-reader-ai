import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/page.tsx"),
  "utf8"
);

describe("Vocabulary export status message has aria-live region (closes #1038)", () => {
  it("exportMsg JSX area has role=\"status\"", () => {
    // Anchor on the JSX conditional render, not the state declaration
    const idx = src.indexOf("{exportMsg &&");
    expect(idx).toBeGreaterThan(-1);
    // Check the 300 chars before the conditional (the wrapping live region)
    const region = src.slice(idx - 300, idx + 50);
    expect(region).toMatch(/role="status"/);
  });

  it("exportMsg JSX area has aria-live=\"polite\"", () => {
    const idx = src.indexOf("{exportMsg &&");
    expect(idx).toBeGreaterThan(-1);
    const region = src.slice(idx - 300, idx + 50);
    expect(region).toMatch(/aria-live="polite"/);
  });
});

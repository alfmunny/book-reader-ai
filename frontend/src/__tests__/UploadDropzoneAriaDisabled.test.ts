/**
 * Static-analysis test: the upload dropzone (role=button) must include
 * aria-disabled to communicate its disabled state to screen readers when
 * quota is full or a file is being uploaded (WCAG 4.1.2 Name, Role, Value).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../app/(shell)/upload/page.tsx"),
  "utf-8",
);

describe("Upload dropzone aria-disabled", () => {
  it("dropzone has role=button", () => {
    expect(src).toContain('role="button"');
  });

  it("dropzone has aria-disabled attribute", () => {
    // The aria-disabled must appear near the role=button anchor
    const idx = src.indexOf('role="button"');
    const window = src.slice(Math.max(0, idx - 20), idx + 300);
    expect(window).toContain("aria-disabled");
  });
});

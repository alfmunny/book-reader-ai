import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/WordActionDrawer.tsx"),
  "utf8",
);

describe("WordActionDrawer has ARIA dialog role (closes #1046)", () => {
  it("drawer div has role=\"dialog\"", () => {
    expect(src).toMatch(/role="dialog"/);
  });

  it("drawer div has aria-modal=\"true\"", () => {
    expect(src).toMatch(/aria-modal="true"/);
  });

  it("drawer div has aria-label", () => {
    expect(src).toMatch(/aria-label=/);
  });
});

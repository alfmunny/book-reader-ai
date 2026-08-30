import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/import/[bookId]/page.tsx"),
  "utf8"
);

describe("Import stage status message title tooltip", () => {
  it("active stage message paragraph has title attribute near truncate class", () => {
    const anchor = src.indexOf('s.message && s.status === "active"');
    expect(anchor).toBeGreaterThan(-1);
    const window = src.slice(anchor, anchor + 200);
    expect(window).toContain("title={s.message}");
  });
});

import * as fs from "fs";
import * as path from "path";

const notesSrc = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/notes/page.tsx"),
  "utf8"
);
const uploadSrc = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/upload/page.tsx"),
  "utf8"
);

describe("notes/page and upload/page touch targets (closes #860)", () => {

  it("upload Sign in button has min-h-[44px]", () => {
    // Sign-in is now a Link — anchor by href
    const idx = uploadSrc.indexOf('href="/login"');
    expect(idx).toBeGreaterThan(-1);
    const window = uploadSrc.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

});

import * as fs from "fs";
import * as path from "path";

const notesSrc = fs.readFileSync(
  path.join(__dirname, "../app/notes/page.tsx"),
  "utf8"
);
const uploadSrc = fs.readFileSync(
  path.join(__dirname, "../app/upload/page.tsx"),
  "utf8"
);

describe("notes/page and upload/page touch targets (closes #860)", () => {
  it("notes Library back button has min-h-[44px]", () => {
    // className comes after onClick in JSX — use forward window
    const idx = notesSrc.indexOf('router.push("/")');
    expect(idx).toBeGreaterThan(-1);
    const window = notesSrc.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("upload Sign in button has min-h-[44px]", () => {
    const idx = uploadSrc.indexOf('router.push("/login")');
    expect(idx).toBeGreaterThan(-1);
    const window = uploadSrc.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("upload Back button has min-h-[44px]", () => {
    // the Back button in the upload form header uses router.push("/")
    const idx = uploadSrc.indexOf('router.push("/")');
    expect(idx).toBeGreaterThan(-1);
    const window = uploadSrc.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });
});

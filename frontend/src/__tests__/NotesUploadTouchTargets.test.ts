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
    // Library back button is now a <Link href="/"> — anchor on href="/" near min-h-[44px]
    const idx = notesSrc.indexOf('href="/"');
    expect(idx).toBeGreaterThan(-1);
    const window = notesSrc.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("upload Sign in button has min-h-[44px]", () => {
    // Sign-in is now a Link — anchor by href
    const idx = uploadSrc.indexOf('href="/login"');
    expect(idx).toBeGreaterThan(-1);
    const window = uploadSrc.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("upload Back button has min-h-[44px]", () => {
    // Back is now a Link — anchor by href
    const idx = uploadSrc.indexOf('href="/"');
    expect(idx).toBeGreaterThan(-1);
    const window = uploadSrc.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });
});

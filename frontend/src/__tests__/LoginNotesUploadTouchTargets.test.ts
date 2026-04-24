import * as fs from "fs";
import * as path from "path";

const login = fs.readFileSync(
  path.join(__dirname, "../app/login/page.tsx"),
  "utf8"
);
const notes = fs.readFileSync(
  path.join(__dirname, "../app/notes/page.tsx"),
  "utf8"
);
const upload = fs.readFileSync(
  path.join(__dirname, "../app/upload/page.tsx"),
  "utf8"
);

describe("Login, Notes, and Upload page touch targets (closes #836)", () => {
  it("Google sign-in button has min-h-[44px]", () => {
    const idx = login.indexOf('signIn("google"');
    expect(idx).toBeGreaterThan(-1);
    const window = login.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("GitHub sign-in button has min-h-[44px]", () => {
    const idx = login.indexOf('signIn("github"');
    expect(idx).toBeGreaterThan(-1);
    const window = login.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("Apple sign-in button has min-h-[44px]", () => {
    const idx = login.indexOf('signIn("apple"');
    expect(idx).toBeGreaterThan(-1);
    const window = login.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("Notes Library back button has min-h-[44px]", () => {
    const idx = notes.indexOf("Library");
    expect(idx).toBeGreaterThan(-1);
    const window = notes.slice(Math.max(0, idx - 200), idx + 20);
    expect(window).toContain("min-h-[44px]");
  });

  it("Upload sign-in CTA button has min-h-[44px]", () => {
    const idx = upload.indexOf("Sign in to upload");
    expect(idx).toBeGreaterThan(-1);
    const window = upload.slice(idx, idx + 400);
    expect(window).toContain("min-h-[44px]");
  });
});

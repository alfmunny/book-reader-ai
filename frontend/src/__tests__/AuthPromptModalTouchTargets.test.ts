import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/AuthPromptModal.tsx"),
  "utf8"
);

describe("AuthPromptModal touch targets (closes #835)", () => {
  it("Sign in link has min-h-[44px]", () => {
    const idx = src.indexOf("/api/auth/signin");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("min-h-[44px]");
  });

  it("Maybe later button has min-h-[44px]", () => {
    const idx = src.indexOf("Maybe later");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 20);
    expect(window).toContain("min-h-[44px]");
  });
});

import * as fs from "fs";
import * as path from "path";

const pendingSrc = fs.readFileSync(
  path.join(__dirname, "../app/pending/page.tsx"),
  "utf8"
);
const iconsSrc = fs.readFileSync(
  path.join(__dirname, "../components/Icons.tsx"),
  "utf8"
);

describe("pending/page.tsx emoji and touch target (closes #852)", () => {
  it("does not use hourglass emoji", () => {
    expect(pendingSrc).not.toContain("⏳");
  });

  it("imports ClockIcon from Icons", () => {
    expect(pendingSrc).toContain("ClockIcon");
  });

  it("Sign out button has min-h-[44px]", () => {
    const idx = pendingSrc.indexOf("Sign out");
    expect(idx).toBeGreaterThan(-1);
    const window = pendingSrc.slice(Math.max(0, idx - 200), idx + 20);
    expect(window).toContain("min-h-[44px]");
  });

  it("ClockIcon is defined in Icons.tsx", () => {
    expect(iconsSrc).toContain("export function ClockIcon");
  });
});

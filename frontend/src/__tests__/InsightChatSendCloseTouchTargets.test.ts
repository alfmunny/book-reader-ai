import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8"
);

describe("InsightChat send/close touch targets (closes #847)", () => {
  it("context-chip close button has min-h-[44px]", () => {
    const idx = src.indexOf("Remove context");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 20);
    expect(window).toContain("min-h-[44px]");
  });

  it("context-chip close button has min-w-[44px]", () => {
    const idx = src.indexOf("Remove context");
    const window = src.slice(Math.max(0, idx - 200), idx + 20);
    expect(window).toContain("min-w-[44px]");
  });

  it("send button has min-h-[44px]", () => {
    const idx = src.indexOf("Send (Enter)");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 20);
    expect(window).toContain("min-h-[44px]");
  });

  it("send button has min-w-[44px]", () => {
    const idx = src.indexOf("Send (Enter)");
    const window = src.slice(Math.max(0, idx - 200), idx + 20);
    expect(window).toContain("min-w-[44px]");
  });
});

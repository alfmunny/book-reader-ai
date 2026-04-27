/**
 * Contrast regression for issue #1751:
 * InsightChat "Load earlier" button must not use text-gray-400 on white background.
 * text-gray-400 (#9ca3af) on white gives ~2.8:1 — fails WCAG AA 4.5:1 for text-xs.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8",
);

describe("InsightChat load-earlier button contrast (closes #1751)", () => {
  it("does not use text-gray-400 alongside hover:text-gray-600 on the load-earlier button", () => {
    // The pattern text-gray-400 hover:text-gray-600 is the failing combination
    expect(src).not.toMatch(/text-gray-400\s+hover:text-gray-600/);
  });
});

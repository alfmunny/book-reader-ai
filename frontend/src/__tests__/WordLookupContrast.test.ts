import * as fs from "fs";
import * as path from "path";

// text-amber-600 (#d97706) on white = ~3.62:1 — fails WCAG 1.4.3 AA at
// text-sm. Closes #1553.

const src = fs.readFileSync(
  path.join(__dirname, "../components/WordLookup.tsx"),
  "utf8",
);

describe("WordLookup loading/error contrast (closes #1553)", () => {
  it("loading status div does not use text-amber-600", () => {
    const idx = src.indexOf('role="status"');
    expect(idx).toBeGreaterThan(-1);
    const opening = src.slice(Math.max(0, idx - 200), idx);
    expect(opening).not.toMatch(/text-amber-600/);
  });

  it("error alert paragraph does not use text-amber-600", () => {
    const idx = src.indexOf('role="alert"');
    expect(idx).toBeGreaterThan(-1);
    const opening = src.slice(Math.max(0, idx - 60), idx + 80);
    expect(opening).not.toMatch(/text-amber-600/);
  });
});

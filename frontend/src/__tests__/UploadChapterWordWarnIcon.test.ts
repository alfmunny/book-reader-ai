import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "../components/ChapterAuditPanel.tsx"), "utf8");

describe("flags are not colour-only (closes #2503)", () => {
  it("each flag chip carries its name as text", () => {
    const idx = src.indexOf("{flag.key}");
    expect(idx).toBeGreaterThan(-1);
  });

  it("flag counts reach assistive tech through the rail button label", () => {
    const idx = src.indexOf("aria-label={`Chapter ${i + 1}");
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx, idx + 260)).toContain("flag");
  });

  it("the open chapter states why it is flagged, in words", () => {
    expect(src).toContain("{f.detail}");
  });
});

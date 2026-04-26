import * as fs from "fs";
import * as path from "path";

// Per codebase convention and tabnabbing prevention, every anchor with
// target="_blank" must also carry rel="noopener noreferrer". Closes #1541.

const src = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8",
);

describe("InsightChat target=_blank links carry rel=noopener (closes #1541)", () => {
  it("does not have a target=\"_blank\" anchor without rel=\"noopener", () => {
    // Find every <a ...target="_blank"...> ... and assert "noopener" appears
    // somewhere inside the same opening tag.
    const anchorRe = /<a\b([^>]*?)>/g;
    let m: RegExpExecArray | null;
    const offenders: string[] = [];
    while ((m = anchorRe.exec(src)) !== null) {
      const attrs = m[1];
      if (attrs.includes('target="_blank"') && !attrs.includes("noopener")) {
        offenders.push(m[0]);
      }
    }
    expect(offenders).toEqual([]);
  });
});

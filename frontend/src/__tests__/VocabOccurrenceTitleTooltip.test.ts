import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Vocabulary occurrence button title tooltip for truncated sentence context", () => {
  it("occurrence button has title attribute near line-clamp-2 span", () => {
    const anchor = src.indexOf("line-clamp-2\">&ldquo;{occ.sentence_text}");
    expect(anchor).toBeGreaterThan(-1);
    // title= appears on the button element before the span with line-clamp-2 (onClick handler spans ~1300 chars between them)
    const window = src.slice(anchor - 1400, anchor + 50);
    expect(window).toContain("title={occ.sentence_text}");
  });
});

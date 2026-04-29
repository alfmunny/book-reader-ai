import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/DeckCard.tsx"),
  "utf8"
);

describe("DeckCard — description title attribute", () => {
  it("description paragraph has a title attribute for truncated text", () => {
    const anchor = src.indexOf("line-clamp-2");
    expect(anchor).toBeGreaterThan(-1);
    const window = src.slice(anchor, anchor + 100);
    expect(window).toContain("title=");
  });

  it("description does not use static className without title", () => {
    const anchor = src.indexOf("line-clamp-2");
    const window = src.slice(anchor, anchor + 100);
    expect(window).not.toMatch(/className="[^"]*line-clamp-2[^"]*">[^<]/);
  });
});

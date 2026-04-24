import * as fs from "fs";
import * as path from "path";

const chat = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8"
);
const icons = fs.readFileSync(
  path.join(__dirname, "../components/Icons.tsx"),
  "utf8"
);

describe("InsightChat icon system compliance (closes #983)", () => {
  it("send button uses ArrowUpIcon from Icons.tsx, not inline SVG", () => {
    // The send button (aria-label="Send message") must use ArrowUpIcon
    const sendBtnIdx = chat.indexOf('aria-label="Send message"');
    expect(sendBtnIdx).toBeGreaterThan(-1);
    const window = chat.slice(sendBtnIdx, sendBtnIdx + 200);
    expect(window).toContain("ArrowUpIcon");
    expect(window).not.toContain("<svg");
  });

  it("save-to-notes button uses BookmarkIcon from Icons.tsx, not inline SVG", () => {
    // Anchor on the JSX text node (second occurrence, the ternary for display)
    const first = chat.indexOf('"Save to notes"');
    expect(first).toBeGreaterThan(-1);
    const saveIdx = chat.indexOf('"Save to notes"', first + 1);
    expect(saveIdx).toBeGreaterThan(-1);
    // BookmarkIcon appears just before the text node in the JSX
    const window = chat.slice(Math.max(0, saveIdx - 200), saveIdx + 50);
    expect(window).toContain("BookmarkIcon");
    expect(window).not.toContain("<svg");
  });

  it("ArrowUpIcon is exported from Icons.tsx", () => {
    expect(icons).toContain("export function ArrowUpIcon");
  });

  it("BookmarkIcon in Icons.tsx accepts a fill prop", () => {
    const idx = icons.indexOf("export function BookmarkIcon");
    expect(idx).toBeGreaterThan(-1);
    const window = icons.slice(idx, idx + 150);
    expect(window).toContain("fill");
  });
});

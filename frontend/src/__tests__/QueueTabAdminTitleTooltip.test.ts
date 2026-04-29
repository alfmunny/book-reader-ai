import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8"
);

describe("QueueTab admin UI title tooltips for truncated text", () => {
  it("preset chain div has title attribute", () => {
    const anchor = src.indexOf('p.chain.join(" → ")');
    expect(anchor).toBeGreaterThan(-1);
    const window = src.slice(anchor - 100, anchor + 50);
    expect(window).toContain('title={p.chain.join(" → ")}');
  });

  it("cost comparison model name div has title attribute", () => {
    // Find the truncated model name div in the cost breakdown section
    const anchor = src.indexOf("text-[11px] text-stone-600 font-mono truncate");
    expect(anchor).toBeGreaterThan(-1);
    const window = src.slice(anchor, anchor + 100);
    expect(window).toContain("title={row.model}");
  });
});

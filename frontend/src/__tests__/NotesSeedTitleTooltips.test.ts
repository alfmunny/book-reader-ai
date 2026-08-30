import * as fs from "fs";
import * as path from "path";

const notesPageSrc = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"),
  "utf8"
);
const seedSrc = fs.readFileSync(
  path.join(__dirname, "../components/SeedPopularButton.tsx"),
  "utf8"
);

describe("Notes page title tooltips for truncated text", () => {
  it("stats summary paragraph has title attribute", () => {
    const anchor = notesPageSrc.indexOf("annotations · {insCount} insights");
    expect(anchor).toBeGreaterThan(-1);
    const window = notesPageSrc.slice(anchor - 200, anchor + 50);
    expect(window).toContain("title={`${annCount} annotations");
  });

  it("export status message has title attribute", () => {
    const anchor = notesPageSrc.indexOf('role="status"');
    expect(anchor).toBeGreaterThan(-1);
    const window = notesPageSrc.slice(anchor, anchor + 400);
    expect(window).toContain("title={exportMsg || undefined}");
  });
});

describe("SeedPopularButton log entry title tooltip for truncated text", () => {
  it("log entry li has title attribute with book id and title", () => {
    const anchor = seedSrc.indexOf("font-mono truncate");
    expect(anchor).toBeGreaterThan(-1);
    const window = seedSrc.slice(anchor - 200, anchor + 50);
    expect(window).toContain("title={`#${entry.book_id}");
  });
});

import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "../../src");

function readSrc(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Reader and QueueTab role=status aria accessibility (WCAG 4.1.3)", () => {
  it("reader page chapter skeleton has role=status", () => {
    const src = readSrc("app/reader/[bookId]/page.tsx");
    expect(src).toMatch(/role="status"/);
  });

  it("reader page chapter skeleton has aria-label for loading", () => {
    const src = readSrc("app/reader/[bookId]/page.tsx");
    expect(src).toMatch(/aria-label="[^"]*[Ll]oad[^"]*"/);
  });

  it("QueueTab initial skeleton has role=status", () => {
    const src = readSrc("components/QueueTab.tsx");
    expect(src).toMatch(/role="status"/);
  });

  it("QueueTab initial skeleton has aria-label for loading", () => {
    const src = readSrc("components/QueueTab.tsx");
    expect(src).toMatch(/aria-label="[^"]*[Ll]oad[^"]*"/);
  });
});

/**
 * Regression test for #2572:
 * Admin audio empty state must include a CTA linking to /admin/books.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/admin/audio/page.tsx"),
  "utf8",
);

describe("Admin audio empty state has CTA (closes #2572)", () => {
  it("empty state contains a link to /admin/books", () => {
    const emptyIdx = src.indexOf("No audio cached");
    expect(emptyIdx).not.toBe(-1);
    const context = src.slice(emptyIdx, emptyIdx + 300);
    expect(context).toContain("/admin/books");
  });

  it("empty state CTA is an anchor or Link element", () => {
    const emptyIdx = src.indexOf("No audio cached");
    const context = src.slice(emptyIdx, emptyIdx + 300);
    expect(context).toMatch(/<a |href=/);
  });
});

/**
 * Regression test for #2457: import page 'Skip' button (pre-import state)
 * must use a semantic Link href={nextUrl} not router.push(nextUrl).
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/app/(shell)/import/[bookId]/page.tsx"),
  "utf8",
);

describe("import/[bookId]/page — 'Skip' nav button (closes #2457)", () => {
  it("does not use router.push for the Skip navigation", () => {
    expect(src).not.toMatch(/onClick=\{[^}]*router\.push\(nextUrl\)[^}]*\}[\s\S]{0,200}Skip/);
  });

  it("uses href={nextUrl} for the Skip link", () => {
    expect(src).toMatch(/href=\{nextUrl\}[\s\S]{0,300}Skip/);
  });
});

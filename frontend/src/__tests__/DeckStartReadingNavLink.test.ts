/**
 * Regression test for #2455: deck page 'Start reading' button (zero-vocab state)
 * must use a semantic Link href="/" not router.push("/").
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/app/decks/[deckId]/page.tsx"),
  "utf8",
);

describe("decks/[deckId]/page — zero-vocab 'Start reading' nav (closes #2455)", () => {
  it("does not use router.push('/') for the Start reading navigation", () => {
    expect(src).not.toMatch(/vocab\.length\s*===?\s*0[^}]*router\.push\(["']\/["']\)/);
  });

  it("uses href='/' for the Start reading link when vocab is empty", () => {
    expect(src).toMatch(/vocab\.length\s*===?\s*0[\s\S]{0,600}href=["']\/["']/);
  });
});

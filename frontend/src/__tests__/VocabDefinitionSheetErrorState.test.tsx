/**
 * Regression test for issue #2417 — DefinitionSheet must show an error state
 * with Retry on fetch failure instead of the misleading "No definition found."
 */
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../app/(shell)/vocabulary/page.tsx"),
  "utf-8",
);

// Locate the DefinitionSheet component body (ends at the next top-level function)
const dsStart = SOURCE.indexOf("function DefinitionSheet(");
const dsEnd = SOURCE.indexOf("\nfunction ", dsStart + 1);
const DS = SOURCE.slice(dsStart, dsEnd === -1 ? SOURCE.length : dsEnd);

describe("DefinitionSheet — error state (issue #2417)", () => {
  it("declares an error state variable", () => {
    expect(DS).toMatch(/const\s+\[.*[Ee]rror.*,\s*set.*[Ee]rror.*\]\s*=\s*useState\s*\(\s*false\s*\)/);
  });

  it("sets error state to true in the catch block", () => {
    // Catch should call an error setter, not be empty
    expect(DS).toMatch(/\.catch\s*\([^)]*\)\s*=>\s*[^)]*[Ee]rror[^)]*\(\s*true\s*\)/);
  });

  it("resets error state to false before retrying", () => {
    expect(DS).toMatch(/set[A-Za-z]*[Ee]rror[A-Za-z]*\s*\(\s*false\s*\)/);
  });

  it("renders a retry button when in error state", () => {
    expect(DS).toMatch(/[Rr]etry/);
  });

  it("renders an error message distinct from 'No definition found'", () => {
    // Matches "Couldn&apos;t load" or "Couldn't load" or "Failed to load" etc.
    expect(DS).toMatch(/Couldn(?:&apos;|')t load|[Ff]ailed to load|[Ee]rror loading/);
  });
});

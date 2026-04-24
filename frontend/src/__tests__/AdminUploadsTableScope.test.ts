import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/uploads/page.tsx"),
  "utf8"
);

describe("Admin uploads table headers have scope=\"col\" (closes #1036)", () => {
  it("all th elements have scope=\"col\"", () => {
    // Find all <th occurrences and verify each has scope="col"
    const thMatches = [...src.matchAll(/<th\b([^>]*)>/g)];
    expect(thMatches.length).toBeGreaterThan(0);
    for (const match of thMatches) {
      expect(match[1]).toMatch(/scope="col"/);
    }
  });

  it("table has at least 6 column headers", () => {
    const thMatches = [...src.matchAll(/<th\b[^>]*>/g)];
    expect(thMatches.length).toBeGreaterThanOrEqual(6);
  });
});

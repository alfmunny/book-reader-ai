import * as fs from "fs";
import * as path from "path";

// text-orange-600 (#ea580c) on white at text-xs measures ≈3.49:1 — fails
// WCAG 1.4.3 AA (4.5:1 needed). Closes #1572.

const usersSrc = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/admin/users/page.tsx"),
  "utf8",
);

const queueSrc = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8",
);

describe("text-orange-600 removed at small sizes (closes #1572)", () => {
  it("(shell)/admin/users does not use text-orange-600", () => {
    expect(usersSrc).not.toMatch(/text-orange-600/);
  });

  it("QueueTab does not use text-orange-600", () => {
    expect(queueSrc).not.toMatch(/text-orange-600/);
  });
});

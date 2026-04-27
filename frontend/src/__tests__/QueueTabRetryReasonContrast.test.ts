import * as fs from "fs";
import * as path from "path";

// QueueTab retry_reason line used text-amber-600 at text-xs on amber-50
// (≈3.4:1) — failed WCAG 1.4.3 AA. Closes #1651.

const src = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8",
);

describe("QueueTab retry_reason contrast (closes #1651)", () => {
  it("does not pair text-amber-600 with truncate in a className", () => {
    expect(src).not.toMatch(/text-amber-600[^"]*truncate/);
    expect(src).not.toMatch(/truncate[^"]*text-amber-600/);
  });
});

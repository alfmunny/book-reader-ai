/**
 * Regression test for issue #1895 — admin/users must not use blocking
 * alert() or confirm() dialogs (WCAG 3.3.1).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/(shell)/admin/users/page.tsx"),
  "utf8",
);

describe("(shell)/admin/users — no blocking dialogs (#1895)", () => {
  it("does not call alert()", () => {
    expect(src).not.toMatch(/\balert\s*\(/);
  });

  it("does not call confirm()", () => {
    expect(src).not.toMatch(/\bconfirm\s*\(/);
  });

  it("shows action errors via a role=alert element", () => {
    expect(src).toMatch(/role="alert"/);
  });

  it("uses two-step delete confirmation (pendingDelete state)", () => {
    expect(src).toMatch(/pendingDelete/);
  });
});

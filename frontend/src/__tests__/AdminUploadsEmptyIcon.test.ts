import * as fs from "fs";
import * as path from "path";

// admin/uploads/page.tsx had an inline <svg> for the empty-state
// illustration, breaking the codebase convention that all SVG icons
// live in components/Icons.tsx (see EmptyNotesIcon, EmptyVocabIcon,
// BookCoverPlaceholderIcon). Closes #1682.

const uploadsSrc = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/admin/uploads/page.tsx"),
  "utf8",
);
const iconsSrc = fs.readFileSync(
  path.join(__dirname, "../components/Icons.tsx"),
  "utf8",
);

describe("admin uploads empty-state icon refactor (closes #1682)", () => {
  it("(shell)/admin/uploads/page.tsx no longer contains a raw <svg opening tag", () => {
    expect(uploadsSrc).not.toMatch(/<svg\b/);
  });

  it("Icons.tsx exports EmptyUploadIcon", () => {
    expect(iconsSrc).toMatch(/export function EmptyUploadIcon\b/);
  });
});

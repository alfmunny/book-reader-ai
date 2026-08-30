/**
 * Regression tests for #2150 — third batch of responsive touch-target resets.
 * Admin pages and SelectionToolbar must pair min-h-[44px] with md:min-h-0.
 */
import * as fs from "fs";
import * as path from "path";

function readSrc(rel: string) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

function checkFile(rel: string, label: string) {
  describe(`${label} (closes #2150)`, () => {
    const src = readSrc(rel);

    it("every min-h-[44px] is paired with md:min-h-0", () => {
      const lines = src.split("\n");
      const violations: string[] = [];
      lines.forEach((line, i) => {
        if (line.includes("min-h-[44px]") && !line.includes("md:min-h-0") && !line.includes("lg:min-h-0")) {
          violations.push(`line ${i + 1}: ${line.trim()}`);
        }
      });
      expect(violations).toEqual([]);
    });

    it("every min-w-[44px] is paired with md:min-w-0", () => {
      const lines = src.split("\n");
      const violations: string[] = [];
      lines.forEach((line, i) => {
        if (line.includes("min-w-[44px]") && !line.includes("md:min-w-0") && !line.includes("lg:min-w-0")) {
          violations.push(`line ${i + 1}: ${line.trim()}`);
        }
      });
      expect(violations).toEqual([]);
    });
  });
}

checkFile("app/(shell)/admin/books/page.tsx", "AdminBooksPage");
checkFile("app/(shell)/admin/uploads/page.tsx", "AdminUploadsPage");
checkFile("app/(shell)/admin/layout.tsx", "AdminLayout");
checkFile("app/(shell)/admin/audio/page.tsx", "AdminAudioPage");
checkFile("app/(shell)/admin/users/page.tsx", "AdminUsersPage");
checkFile("components/SelectionToolbar.tsx", "SelectionToolbar");

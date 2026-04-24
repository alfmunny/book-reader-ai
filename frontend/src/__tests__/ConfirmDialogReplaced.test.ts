/**
 * Static assertions: confirm() dialogs replaced with UndoToast
 * Closes #1082
 */
import fs from "fs";
import path from "path";

const notesPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/notes/[bookId]/page.tsx"),
  "utf8",
);

const homePage = fs.readFileSync(
  path.join(process.cwd(), "src/app/page.tsx"),
  "utf8",
);

describe("ConfirmDialogReplaced", () => {
  it("notes/[bookId]/page.tsx has no window.confirm for annotation delete", () => {
    expect(notesPage).not.toContain('window.confirm("Delete this annotation?")');
  });

  it("notes/[bookId]/page.tsx has no window.confirm for insight delete", () => {
    expect(notesPage).not.toContain('window.confirm("Delete this insight?")');
  });

  it("app/page.tsx has no confirm() for library remove", () => {
    expect(homePage).not.toMatch(/confirm\(`Remove/);
  });

  it("notes/[bookId]/page.tsx imports UndoToast", () => {
    expect(notesPage).toContain('import UndoToast from "@/components/UndoToast"');
  });

  it("app/page.tsx imports UndoToast", () => {
    expect(homePage).toContain('import UndoToast from "@/components/UndoToast"');
  });
});

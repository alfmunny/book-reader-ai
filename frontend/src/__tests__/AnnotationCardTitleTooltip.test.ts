import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Annotation card title tooltip for truncated text", () => {
  it("desktop sidebar annotation card (role=button) has title attribute near line-clamp-3", () => {
    // Find the role="button" annotation card in the sidebar
    const roleButtonIdx = src.indexOf('aria-label={`Jump to annotation:');
    expect(roleButtonIdx).toBeGreaterThan(-1);
    // Check within 200 chars of the aria-label for a title attribute
    const window = src.slice(roleButtonIdx - 50, roleButtonIdx + 300);
    expect(window).toContain("title=");
  });

  it("mobile bottom sheet annotation button has title attribute near line-clamp-2", () => {
    // Use lastIndexOf to get the mobile bottom sheet list (last occurrence of the label)
    const listIdx = src.lastIndexOf('aria-label="Annotations"');
    expect(listIdx).toBeGreaterThan(-1);
    // The button in this list should have a title attribute within 900 chars
    const window = src.slice(listIdx, listIdx + 900);
    expect(window).toContain("title=");
  });
});

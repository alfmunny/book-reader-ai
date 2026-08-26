/**
 * Regression tests for issue #2447 — home page nav bar items (Upload, Notes,
 * Vocabulary, Admin) must be <Link> elements, not <button> with router.push,
 * so they support Ctrl+Click / middle-click and announce as "link" to screen readers.
 */
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../components/SiteHeader.tsx"),
  "utf8"
);

describe("Home page nav bar — routing items must be Link elements (issue #2447)", () => {
  it("Upload nav item uses Link href=/upload, not button+router.push", () => {
    // Should NOT have button with router.push("/upload")
    expect(SOURCE).not.toMatch(/router\.push\(["'`]\/upload["'`]\)/);
    // Should have Link href="/upload"
    expect(SOURCE).toMatch(/href=["'`]\/upload["'`]/);
  });

  it("Your Notes nav item uses Link href=/notes, not button+router.push", () => {
    // The /notes route link should not be a router.push
    expect(SOURCE).not.toMatch(/router\.push\(["'`]\/notes["'`]\)/);
    expect(SOURCE).toMatch(/href=["'`]\/notes["'`]/);
  });

  it("Vocabulary nav item uses Link href=/vocabulary, not button+router.push", () => {
    expect(SOURCE).not.toMatch(/router\.push\(["'`]\/vocabulary["'`]\)/);
    expect(SOURCE).toMatch(/href=["'`]\/vocabulary["'`]/);
  });

  it("Admin nav item uses Link href=/admin, not button+router.push", () => {
    expect(SOURCE).not.toMatch(/router\.push\(["'`]\/admin["'`]\)/);
    expect(SOURCE).toMatch(/href=["'`]\/admin["'`]/);
  });
});

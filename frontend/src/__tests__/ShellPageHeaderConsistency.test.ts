/**
 * Owner, 2026-08-31: "the title bar of every item in the nav bar has different
 * width and style". Home and Bookshelf set the rhythm; the rest had drifted to
 * max-w-lg / 2xl / 3xl with their own heading sizes, so the header changed
 * size and weight as you moved between tabs.
 */
import fs from "fs";
import path from "path";

const shell = path.join(__dirname, "../app/(shell)");
const read = (p: string) => fs.readFileSync(path.join(shell, p), "utf8");

const PAGES = [
  "page.tsx",            // Home — the reference
  "bookshelf/page.tsx",  // Bookshelf — the reference
  "notes/page.tsx",
  "vocabulary/page.tsx",
  "decks/page.tsx",
  "upload/page.tsx",
  "search/page.tsx",
  "discover/page.tsx",
  "profile/page.tsx",
];

describe("app-shell page headers", () => {
  it.each(PAGES)("%s constrains its content to the shared width", (file) => {
    const src = read(file);
    expect(src).toContain("max-w-5xl mx-auto");
    // the widths these pages used to sit at. Detail views under a tab
    // (a single deck, one book's notes) keep their own narrower measure.
    expect(src).not.toMatch(/max-w-(lg|2xl|3xl) mx-auto px-/);
  });

  it.each(PAGES.filter((f) => f !== "page.tsx" && f !== "bookshelf/page.tsx"))(
    "%s titles its page with one heading style",
    (file) => {
      const src = read(file);
      const h1s = src.match(/<h1 className="[^"]*"/g) ?? [];
      const page = h1s.filter((h) => !h.includes("mb-2")); // sign-in prompts keep their own
      for (const h of page) {
        expect(h).toContain("font-serif");
        expect(h).toContain("text-xl");
        expect(h).toContain("font-bold");
      }
    },
  );

  it("gives the admin panel the same header as every other tab", () => {
    const layout = read("admin/layout.tsx");
    expect(layout).toContain('<h1 className="font-serif text-xl font-bold text-ink">Admin Panel</h1>');
    // its title used to run full-bleed while the body below was max-w-5xl
    expect(layout).toContain('<div className="max-w-5xl mx-auto flex items-center gap-3 md:gap-4">');
  });
});

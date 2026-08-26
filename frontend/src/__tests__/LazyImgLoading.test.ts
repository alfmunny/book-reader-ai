/**
 * Static-analysis tests: remote <img> elements must have loading="lazy"
 * to avoid blocking page load with off-screen images.
 */
import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "..");

function src(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf-8");
}

describe("loading='lazy' on remote images", () => {
  it("BookCard cover img has loading=lazy", () => {
    const content = src("components/BookCard.tsx");
    const idx = content.indexOf("src={book.cover}");
    expect(idx).toBeGreaterThan(-1);
    const window = content.slice(idx, idx + 200);
    expect(window).toContain('loading="lazy"');
  });

  it("BookDetailModal cover img has loading=lazy", () => {
    const content = src("components/BookDetailModal.tsx");
    const idx = content.indexOf("src={book.cover}");
    expect(idx).toBeGreaterThan(-1);
    const window = content.slice(idx, idx + 200);
    expect(window).toContain('loading="lazy"');
  });

  it("page.tsx user avatar img has loading=lazy", () => {
    const content = ["components/SiteHeader.tsx", "app/page.tsx", "app/bookshelf/page.tsx"].map(src).join("\n");
    const idx = content.indexOf("src={session.backendUser.picture}");
    expect(idx).toBeGreaterThan(-1);
    const window = content.slice(idx, idx + 200);
    expect(window).toContain('loading="lazy"');
  });

  it("page.tsx Continue Reading cover img has loading=lazy", () => {
    const content = ["components/SiteHeader.tsx", "app/page.tsx", "app/bookshelf/page.tsx"].map(src).join("\n");
    const idx = content.indexOf("src={recentBooks[0].cover}");
    expect(idx).toBeGreaterThan(-1);
    const window = content.slice(idx, idx + 200);
    expect(window).toContain('loading="lazy"');
  });

  it("BookCard cover img has loading=lazy", () => {
    // The Popular Classics list row went with the Discover tab (#2711); catalog
    // and bookshelf covers are both rendered by BookCard.
    const content = src("components/BookCard.tsx");
    const idx = content.indexOf("<img");
    expect(idx).toBeGreaterThan(-1);
    expect(content).toContain('loading="lazy"');
  });

  it("admin/users page avatar img has loading=lazy", () => {
    const content = src("app/admin/users/page.tsx");
    const idx = content.indexOf("src={u.picture}");
    expect(idx).toBeGreaterThan(-1);
    const window = content.slice(idx, idx + 200);
    expect(window).toContain('loading="lazy"');
  });

  it("reader page user avatar img has loading=lazy", () => {
    const content = src("app/reader/[bookId]/page.tsx");
    // Find the img element inside the reader toolbar avatar
    const idx = content.indexOf('src={session.backendUser.picture}');
    expect(idx).toBeGreaterThan(-1);
    const window = content.slice(idx, idx + 200);
    expect(window).toContain('loading="lazy"');
  });
});

/**
 * Regression tests for #2344: action toast notifications must use the
 * always-present + conditionally-mounted split pattern (WCAG 4.1.3) so AT
 * announces toast messages even though the visual container is conditional.
 *
 * Broken pattern: {toast && <div role="status">message + dismiss button</div>}
 *   — AT never hears the announcement (live region injected with its content).
 *
 * Fixed pattern:
 *   Always-present sr-only mirror  → <span aria-live="polite">{toast ?? ""}</span>
 *   Conditional visual toast       → {toast && <div>message + dismiss button</div>}
 */
import * as fs from "fs";
import * as path from "path";

const adminBooksSrc = fs.readFileSync(
  path.join(__dirname, "../app/admin/books/page.tsx"),
  "utf8",
);
const queueTabSrc = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8",
);
const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

// ── Admin books page toast ─────────────────────────────────────────────────

describe("Admin books page toast live region — WCAG 4.1.3 (closes #2344)", () => {
  it("toast container is not the sole role=status on the page (split pattern)", () => {
    // Broken: {toast && (<div role="status"...)}
    expect(adminBooksSrc).not.toMatch(
      /\{toast\s*&&\s*\(?\s*\n?\s*<div\s[^>]*role="status"/,
    );
  });

  it("always-present sr-only aria-live mirror exists for toast", () => {
    const idx = adminBooksSrc.indexOf("aria-live-toast-mirror");
    expect(idx).toBeGreaterThan(-1);
    const section = adminBooksSrc.slice(idx, idx + 200);
    expect(section).toMatch(/aria-live="polite"/);
    expect(section).toMatch(/sr-only/);
  });
});

// ── QueueTab toast ─────────────────────────────────────────────────────────

describe("QueueTab toast live region — WCAG 4.1.3 (closes #2344)", () => {
  it("toast container is not conditionally mounting a role=status", () => {
    expect(queueTabSrc).not.toMatch(
      /\{toast\s*&&\s*\(?\s*\n?\s*<div\s[^>]*role="status"/,
    );
  });

  it("always-present sr-only aria-live mirror exists for toast", () => {
    const idx = queueTabSrc.indexOf("aria-live-toast-mirror");
    expect(idx).toBeGreaterThan(-1);
    const section = queueTabSrc.slice(idx, idx + 200);
    expect(section).toMatch(/aria-live="polite"/);
    expect(section).toMatch(/sr-only/);
  });
});

// ── Reader obsidian toast ──────────────────────────────────────────────────

describe("Reader obsidian toast live region — WCAG 4.1.3 (closes #2344)", () => {
  it("obsidianToast container is not conditionally mounting a role=status", () => {
    expect(readerSrc).not.toMatch(
      /\{obsidianToast\s*&&\s*\(?\s*\n?\s*<div\s[^>]*role="status"/,
    );
  });

  it("always-present sr-only aria-live mirror exists for obsidianToast", () => {
    const idx = readerSrc.indexOf("aria-live-obsidian-toast-mirror");
    expect(idx).toBeGreaterThan(-1);
    const section = readerSrc.slice(idx, idx + 200);
    expect(section).toMatch(/aria-live="polite"/);
    expect(section).toMatch(/sr-only/);
  });
});

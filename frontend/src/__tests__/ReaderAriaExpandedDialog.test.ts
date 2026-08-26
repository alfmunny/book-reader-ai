/**
 * Regression tests for #1245: reader page disclosure buttons must have
 * aria-expanded, and the mobile chat sheet must have role="dialog".
 * #1877: chat sheet must also have full WAI-ARIA focus management (ref,
 * tabIndex=-1, focus-on-open effect, Escape handler).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader page disclosure button aria-expanded (closes #1245)", () => {
  it("Typography settings button has aria-expanded", () => {
    const idx = src.indexOf('aria-label="Typography settings"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("aria-expanded");
  });

  it("Notes button has aria-expanded", () => {
    // Mobile notes button uses a dynamic aria-label (includes count when > 0).
    // Anchor on the setNotesExpanded call inside the button's onClick.
    // aria-expanded comes after the long className template literal (~545 chars)
    const idx = src.indexOf('setNotesExpanded((v) => !v)');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 600);
    expect(window).toContain("aria-expanded");
  });

  it("Insight chat button has aria-expanded", () => {
    const idx = src.indexOf('aria-label="Insight chat"');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 100);
    expect(window).toContain("aria-expanded");
  });
});

describe("Mobile chat sheet role=dialog (closes #1245)", () => {
  it("chat sheet inner div has role=dialog", () => {
    const idx = src.indexOf("Chat sheet (bottom half)");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain('role="dialog"');
  });

  it("chat sheet inner div has aria-modal", () => {
    const idx = src.indexOf("Chat sheet (bottom half)");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain('aria-modal="true"');
  });

  it("chat sheet inner div has an accessible name", () => {
    // #2745 made the sheet render the selected sidebar tab, so its name is now
    // conditional ("Contents" or "Chat") rather than a literal.
    const idx = src.indexOf("Chat sheet (bottom half)");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 400);
    expect(window).toMatch(/aria-label=\{[^}]*"Contents"[^}]*"Chat"[^}]*\}/);
  });

  it("chat sheet div has ref and tabIndex=-1 for programmatic focus (WCAG 2.4.3 / #1877)", () => {
    const idx = src.indexOf("Chat sheet (bottom half)");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 200);
    expect(window).toContain("chatSheetRef");
    expect(window).toContain("tabIndex={-1}");
  });
});

describe("Mobile chat sheet focus management (WCAG 2.4.3 / #1877)", () => {
  it("declares chatSheetRef via useRef", () => {
    expect(src).toContain("chatSheetRef = useRef");
  });

  it("moves focus to chatSheetRef on open", () => {
    expect(src).toContain("chatSheetRef.current?.focus()");
  });

  it("has Escape key handler to close chat sheet", () => {
    // The effect must handle Escape and call both setSidebarOpen and setChatSheetText
    const idx = src.indexOf('e.key === "Escape"');
    expect(idx).toBeGreaterThan(-1);
    const region = src.slice(Math.max(0, idx - 100), idx + 200);
    expect(region).toContain("setSidebarOpen");
    expect(region).toContain("setChatSheetText");
  });
});

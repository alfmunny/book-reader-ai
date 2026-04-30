/**
 * Regression tests for #2531:
 * Error-state panels that show "Couldn't load …" + Retry must use role="alert"
 * (aria-live="assertive") not role="status" (aria-live="polite") — WCAG 4.1.3.
 */
import fs from "fs";
import path from "path";

function readSrc(rel: string) {
  return fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");
}

function nearestRoleBefore(src: string, marker: string): string | null {
  const idx = src.indexOf(marker);
  if (idx === -1) return null;
  const context = src.slice(Math.max(0, idx - 400), idx);
  const roles = [...context.matchAll(/role="(\w+)"/g)];
  return roles.length > 0 ? roles[roles.length - 1][1] : null;
}

describe("Error panels use role=alert not role=status (closes #2531)", () => {
  it("home page stats error uses role=alert", () => {
    const src = readSrc("app/page.tsx");
    const role = nearestRoleBefore(src, "Couldn&apos;t load stats");
    expect(role).toBe("alert");
  });

  it("admin users identity error uses role=alert", () => {
    const src = readSrc("app/admin/users/page.tsx");
    const role = nearestRoleBefore(src, "Couldn&apos;t verify your identity");
    expect(role).toBe("alert");
  });

  it("profile decks fetch error uses role=alert", () => {
    const src = readSrc("app/profile/page.tsx");
    const role = nearestRoleBefore(src, "Couldn&apos;t load study decks");
    expect(role).toBe("alert");
  });

  it("profile gemini key fetch error uses role=alert", () => {
    const src = readSrc("app/profile/page.tsx");
    const role = nearestRoleBefore(src, "Couldn&apos;t load key status");
    expect(role).toBe("alert");
  });

  it("profile obsidian fetch error uses role=alert", () => {
    const src = readSrc("app/profile/page.tsx");
    const role = nearestRoleBefore(src, "Couldn&apos;t load Obsidian settings");
    expect(role).toBe("alert");
  });

  it("vocabulary definition fetch error uses role=alert", () => {
    const src = readSrc("app/vocabulary/page.tsx");
    const role = nearestRoleBefore(src, "Couldn&apos;t load definition");
    expect(role).toBe("alert");
  });

  it("vocabulary tags fetch error uses role=alert", () => {
    const src = readSrc("app/vocabulary/page.tsx");
    const role = nearestRoleBefore(src, "Couldn&apos;t load tags");
    expect(role).toBe("alert");
  });

  it("flashcards decks fetch error uses role=alert", () => {
    const src = readSrc("app/vocabulary/flashcards/page.tsx");
    const role = nearestRoleBefore(src, "Couldn&apos;t load decks");
    expect(role).toBe("alert");
  });

  it("upload quota fetch error uses role=alert", () => {
    const src = readSrc("app/upload/page.tsx");
    const role = nearestRoleBefore(src, "Couldn&apos;t load quota");
    expect(role).toBe("alert");
  });

  it("ReadingStats fetch error uses role=alert", () => {
    const src = readSrc("components/ReadingStats.tsx");
    const role = nearestRoleBefore(src, "Couldn&apos;t load reading stats");
    expect(role).toBe("alert");
  });

  it("VocabWordTooltip definition fetch error uses role=alert", () => {
    const src = readSrc("components/VocabWordTooltip.tsx");
    const role = nearestRoleBefore(src, "Couldn&apos;t load definition");
    expect(role).toBe("alert");
  });
});

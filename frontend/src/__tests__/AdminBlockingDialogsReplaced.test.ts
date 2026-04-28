/**
 * Regression tests for issue #1897 — admin/audio, admin/books, QueueTab,
 * and SeedPopularButton must not use blocking alert() or confirm() dialogs.
 */
import { readFileSync } from "fs";
import { join } from "path";

const audioSrc = readFileSync(
  join(__dirname, "../app/admin/audio/page.tsx"),
  "utf8",
);

const seedSrc = readFileSync(
  join(__dirname, "../components/SeedPopularButton.tsx"),
  "utf8",
);

const booksSrc = readFileSync(
  join(__dirname, "../app/admin/books/page.tsx"),
  "utf8",
);

const queueSrc = readFileSync(
  join(__dirname, "../components/QueueTab.tsx"),
  "utf8",
);

describe("admin/audio — no blocking dialogs (#1897)", () => {
  it("does not call alert()", () => {
    expect(audioSrc).not.toMatch(/\balert\s*\(/);
  });

  it("does not call confirm()", () => {
    expect(audioSrc).not.toMatch(/\bconfirm\s*\(/);
  });

  it("shows action errors via a role=alert element", () => {
    expect(audioSrc).toMatch(/role="alert"/);
  });
});

describe("SeedPopularButton — no blocking dialogs (#1897)", () => {
  it("does not call alert()", () => {
    expect(seedSrc).not.toMatch(/\balert\s*\(/);
  });

  it("does not call confirm()", () => {
    expect(seedSrc).not.toMatch(/\bconfirm\s*\(/);
  });

  it("uses a pending confirmation state for destructive actions", () => {
    expect(seedSrc).toMatch(/pending/i);
  });
});

describe("admin/books — no blocking dialogs (#1897)", () => {
  it("does not call alert()", () => {
    expect(booksSrc).not.toMatch(/\balert\s*\(/);
  });

  it("does not call confirm()", () => {
    expect(booksSrc).not.toMatch(/\bconfirm\s*\(/);
  });

  it("shows action errors via a role=alert element", () => {
    expect(booksSrc).toMatch(/role="alert"/);
  });

  it("uses pendingConfirm for destructive action confirmation", () => {
    expect(booksSrc).toMatch(/pendingConfirm/);
  });
});

describe("QueueTab — no blocking dialogs (#1897)", () => {
  it("does not call alert()", () => {
    expect(queueSrc).not.toMatch(/\balert\s*\(/);
  });

  it("does not call confirm()", () => {
    expect(queueSrc).not.toMatch(/\bconfirm\s*\(/);
  });

  it("shows action errors via a role=alert element", () => {
    expect(queueSrc).toMatch(/role="alert"/);
  });

  it("uses pendingConfirm for destructive action confirmation", () => {
    expect(queueSrc).toMatch(/pendingConfirm/);
  });
});

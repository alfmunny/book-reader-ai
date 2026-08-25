/**
 * Owner report (2026-08-25): the reader forgets whether the insight sidebar
 * was open — every load starts closed on the default tab. The open state and
 * active tab now persist in app settings and are restored on load (open state
 * on desktop only, so mobile doesn't greet the reader with an auto-opened
 * bottom sheet).
 */
import fs from "fs";
import path from "path";
import { getSettings, saveSettings } from "@/lib/settings";

const readerSrc = fs.readFileSync(
  path.join(process.cwd(), "src/app/reader/[bookId]/page.tsx"),
  "utf8",
);

beforeEach(() => localStorage.clear());

describe("settings fields", () => {
  it("defaults: sidebar closed, chat tab", () => {
    expect(getSettings().readerSidebarOpen).toBe(false);
    expect(getSettings().readerSidebarTab).toBe("chat");
  });

  it("round-trips through saveSettings", () => {
    saveSettings({ readerSidebarOpen: true, readerSidebarTab: "vocab" });
    expect(getSettings().readerSidebarOpen).toBe(true);
    expect(getSettings().readerSidebarTab).toBe("vocab");
  });
});

describe("reader wiring", () => {
  it("restores the sidebar AFTER mount, desktop-gated for open state", () => {
    expect(readerSrc).toMatch(/readerSidebarOpen/);
    expect(readerSrc).toMatch(/readerSidebarTab/);
    // Restoring "open" must be desktop-only — the same state drives the
    // mobile bottom sheet, which must not auto-open on load.
    expect(readerSrc).toMatch(/innerWidth\s*>=\s*768/);
  });

  it("persists open state and tab on change", () => {
    expect(readerSrc).toMatch(
      /saveSettings\(\{\s*readerSidebarOpen:\s*sidebarOpen,\s*readerSidebarTab:\s*sidebarTab\s*\}\)/,
    );
  });

  it("never reads settings or localStorage during the first render (hydration)", () => {
    // Regression (owner report, 2026-08-26): reading persisted state in a
    // useState initializer makes the client's first render differ from the
    // server's HTML → "Hydration failed" overlay. Stored state must be
    // applied in a mount effect instead.
    expect(readerSrc).not.toMatch(/typeof window !== "undefined"[^\n]*getSettings/);
    expect(readerSrc).not.toMatch(/useState\([^)\n]*getSettings/);
    expect(readerSrc).not.toMatch(/useState\(\(\) =>[\s\S]{0,160}localStorage\.getItem\("reader-show-annotations"\)/);
  });
});

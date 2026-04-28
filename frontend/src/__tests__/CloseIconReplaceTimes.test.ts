/**
 * Regression test for #1921:
 * Dismiss buttons must use CloseIcon SVG, not the × Unicode character,
 * per CLAUDE.md icon-system rules.
 */
import { readFileSync } from "fs";
import { join } from "path";

function read(rel: string) {
  return readFileSync(join(__dirname, rel), "utf8");
}

const queueTab = read("../components/QueueTab.tsx");
const adminUsers = read("../app/admin/users/page.tsx");
const adminBooks = read("../app/admin/books/page.tsx");
const adminAudio = read("../app/admin/audio/page.tsx");

/**
 * Extract the text content of each dismiss button by finding
 * "aria-label="Dismiss" and capturing up to the next </button>.
 * This avoids trying to parse multi-line JSX opening tags.
 */
function dismissButtonBodies(src: string): string[] {
  const results: string[] = [];
  const re = /aria-label="Dismiss[^"]*"[\s\S]{0,300}?<\/button>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    results.push(m[0]);
  }
  return results;
}

describe("CloseIcon replaces × dismiss buttons (closes #1921)", () => {
  it("QueueTab dismiss buttons use CloseIcon, not ×", () => {
    const btns = dismissButtonBodies(queueTab);
    expect(btns.length).toBeGreaterThan(0);
    for (const btn of btns) {
      expect(btn).not.toMatch(/>\s*×\s*</);
      expect(btn).toMatch(/CloseIcon/);
    }
  });

  it("admin/users dismiss button uses CloseIcon, not ×", () => {
    const btns = dismissButtonBodies(adminUsers);
    expect(btns.length).toBeGreaterThan(0);
    for (const btn of btns) {
      expect(btn).not.toMatch(/>\s*×\s*</);
      expect(btn).toMatch(/CloseIcon/);
    }
  });

  it("admin/books dismiss buttons use CloseIcon, not ×", () => {
    const btns = dismissButtonBodies(adminBooks);
    expect(btns.length).toBeGreaterThan(0);
    for (const btn of btns) {
      expect(btn).not.toMatch(/>\s*×\s*</);
      expect(btn).toMatch(/CloseIcon/);
    }
  });

  it("admin/audio dismiss button uses CloseIcon, not ×", () => {
    const btns = dismissButtonBodies(adminAudio);
    expect(btns.length).toBeGreaterThan(0);
    for (const btn of btns) {
      expect(btn).not.toMatch(/>\s*×\s*</);
      expect(btn).toMatch(/CloseIcon/);
    }
  });
});

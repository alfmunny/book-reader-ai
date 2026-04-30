/**
 * Regression test for #2346: reader obsidian toast must distinguish success
 * from error messages. Before the fix, ALL non-URL messages (including
 * "Insight saved to book notes") rendered in text-red-600 error styling.
 *
 * Fixed by changing obsidianToast state to { msg: string; ok: boolean } | null
 * so the render branch can use .ok to choose success vs error styling.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader obsidian toast success/error color (closes #2346)", () => {
  it("obsidianToast state is typed with ok flag, not plain string", () => {
    // After fix: state is { msg: string; ok: boolean } | null
    expect(src).toMatch(/obsidianToast.*\{.*ok.*boolean/s);
  });

  it("toast render uses .ok to choose emerald vs red styling", () => {
    // Success messages → emerald; error messages → red
    const idx = src.indexOf("obsidianToast.ok");
    expect(idx).toBeGreaterThan(-1);
    const section = src.slice(idx, idx + 300);
    expect(section).toMatch(/text-emerald/);
    expect(section).toMatch(/text-red-600/);
  });

  it("insight save sets ok:true for success", () => {
    // Saved to book notes is a success — msg appears before ok in the object
    expect(src).toMatch(/Insight saved to book notes[^}]*ok:\s*true/s);
  });

  it("insight save sets ok:false for failure", () => {
    expect(src).toMatch(/Failed to save insight[^}]*ok:\s*false/s);
  });
});

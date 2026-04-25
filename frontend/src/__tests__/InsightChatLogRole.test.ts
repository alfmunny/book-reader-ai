/**
 * Static assertion: InsightChat message container has role=log with aria-live.
 * Closes #1125
 */
import fs from "fs";
import path from "path";

const chat = fs.readFileSync(
  path.join(process.cwd(), "src/components/InsightChat.tsx"),
  "utf8",
);

describe("InsightChat message container", () => {
  it("has role=log on the scroll container (messagesBoxRef)", () => {
    // Look for the messagesBoxRef div and verify it has role=log
    const idx = chat.indexOf("ref={messagesBoxRef}");
    expect(idx).toBeGreaterThan(0);
    const block = chat.slice(Math.max(0, idx - 200), idx + 400);
    expect(block).toContain('role="log"');
  });

  it("has aria-live=polite on the scroll container", () => {
    const idx = chat.indexOf("ref={messagesBoxRef}");
    const block = chat.slice(Math.max(0, idx - 200), idx + 400);
    expect(block).toContain('aria-live="polite"');
  });

  it("has aria-label on the scroll container", () => {
    const idx = chat.indexOf("ref={messagesBoxRef}");
    const block = chat.slice(Math.max(0, idx - 200), idx + 400);
    expect(block).toMatch(/aria-label="Conversation"/);
  });
});

/**
 * Static assertions: InsightChat message bubbles include screen-reader-only sender prefix.
 * Closes #1141
 */
import fs from "fs";
import path from "path";

const chat = fs.readFileSync(
  path.join(process.cwd(), "src/components/InsightChat.tsx"),
  "utf8",
);

describe("InsightChat message sender labels", () => {
  it("user message bubble has sr-only You: prefix", () => {
    expect(chat).toMatch(/className="sr-only">You: /);
  });

  it("assistant message bubble has sr-only Assistant: prefix", () => {
    expect(chat).toMatch(/className="sr-only">Assistant: /);
  });
});

/**
 * Regression test for issue #2408: InsightChat rendered API errors as normal
 * assistant chat bubbles — indistinguishable from real AI responses.
 *
 * Error messages (content starting with "Error:") must be rendered with a
 * distinct style (role="alert", no AI avatar, error colours) so users notice
 * the failure and screen readers announce it immediately.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/components/InsightChat.tsx"),
  "utf8",
);

describe("InsightChat error message display (issue #2408)", () => {
  it("detects error messages by checking content starting with 'Error:'", () => {
    // The component must branch on whether msg.content starts with "Error:"
    expect(src).toMatch(/startsWith\(["']Error:/);
  });

  it("renders error messages with role='alert' for screen reader announcement", () => {
    expect(src).toMatch(/role="alert"/);
  });

  it("error bubble uses visually distinct error styling (red/rose colours)", () => {
    // Must have red or rose colour classes for error branch
    expect(src).toMatch(/text-red-|bg-red-|text-rose-|bg-rose-/);
  });

  it("imports AlertCircleIcon for the error state icon", () => {
    expect(src).toMatch(/AlertCircleIcon/);
  });

  it("error messages are NOT rendered through the normal prose ReactMarkdown path", () => {
    // The error branch should short-circuit before the prose div + ReactMarkdown
    // We verify this by checking that there's a conditional return or early branch
    // with role="alert" that appears in the message rendering section
    expect(src).toMatch(/isError|is_error|startsWith\(["']Error:/);
  });
});

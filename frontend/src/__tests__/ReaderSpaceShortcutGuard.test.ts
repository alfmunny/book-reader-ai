import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("Reader keyboard shortcut guard (WCAG 2.1.1)", () => {
  it("keyboard shortcut guard must skip BUTTON tag to preserve Space-to-activate", () => {
    // The guard must include BUTTON so Space key on a focused button
    // activates the button rather than triggering TTS play/pause.
    expect(src).toMatch(/tag === "BUTTON"/);
  });

  it("keyboard shortcut guard must skip A tag to preserve Space/Enter on links", () => {
    expect(src).toMatch(/tag === "A"/);
  });
});

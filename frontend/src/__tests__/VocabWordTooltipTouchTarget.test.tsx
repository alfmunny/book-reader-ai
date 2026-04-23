/**
 * Regression test for #600: VocabWordTooltip "Save to vocab" button must
 * meet the 44px minimum touch target height requirement.
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  getWordDefinition: jest.fn().mockResolvedValue({
    lemma: "beistehen",
    language: "de",
    definitions: [{ pos: "Verb", text: "to assist" }],
    url: "https://en.wiktionary.org/wiki/beistehen",
  }),
}));

import VocabWordTooltip from "@/components/VocabWordTooltip";

const RECT = {
  left: 100, top: 200, right: 200, bottom: 220, width: 100, height: 20, x: 100, y: 200,
  toJSON: () => ({}),
} as DOMRect;

const BASE = { word: "beistehen", lang: "de", rect: RECT, onClose: jest.fn(), onSave: jest.fn() };
const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

describe("VocabWordTooltip — save button touch target (#600)", () => {
  it("save button has min-h-[44px] class", async () => {
    render(<VocabWordTooltip {...BASE} />);
    await act(async () => await flushPromises());

    const saveBtn = screen.getByRole("button", { name: /save to vocab/i });
    expect(saveBtn.className).toContain("min-h-[44px]");
  });
});

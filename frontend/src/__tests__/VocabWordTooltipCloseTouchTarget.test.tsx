/**
 * Regression test for issue #627 — VocabWordTooltip close button below 44px.
 */
import React from "react";
import { render } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  getWordDefinition: jest.fn().mockResolvedValue({ definitions: [] }),
  saveVocabWord: jest.fn().mockResolvedValue({}),
}));

import VocabWordTooltip from "@/components/VocabWordTooltip";

const mockRect = {
  top: 100, left: 100, bottom: 120, right: 200, width: 100, height: 20,
  x: 100, y: 100, toJSON: () => {},
} as DOMRect;

const BASE = {
  word: "serendipity",
  lang: "en",
  rect: mockRect,
  onClose: jest.fn(),
  onSave: jest.fn(),
};

test("close button has min-h-[44px] and min-w-[44px]", () => {
  render(<VocabWordTooltip {...BASE} />);

  const closeBtn = document.querySelector("button[aria-label='Close']") as HTMLButtonElement | null;
  expect(closeBtn).not.toBeNull();
  expect(closeBtn!.className).toContain("min-h-[44px]");
  expect(closeBtn!.className).toContain("min-w-[44px]");
});

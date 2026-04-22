/**
 * VocabWordTooltip — additional coverage:
 * Line 32: outside mousedown triggers onClose
 * Line 57: if (saved) return; guard — double-save blocked even via direct click on disabled button
 * Line 53-54: right-edge position clamp (left + tooltipW > window.innerWidth - 8)
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/lib/api", () => ({
  getWordDefinition: jest.fn().mockResolvedValue({
    lemma: "leviathan",
    language: "en",
    definitions: [{ pos: "noun", text: "a sea monster" }],
    url: "https://en.wiktionary.org/wiki/leviathan",
  }),
}));

import VocabWordTooltip from "@/components/VocabWordTooltip";

const makeRect = (overrides: Partial<DOMRect> = {}): DOMRect => ({
  left: 100, top: 200, right: 200, bottom: 220,
  width: 100, height: 20, x: 100, y: 200,
  toJSON: () => ({}),
  ...overrides,
} as DOMRect);

const BASE = {
  word: "leviathan",
  lang: "en",
  rect: makeRect(),
  onClose: jest.fn(),
  onSave: jest.fn(),
};

beforeEach(() => { jest.clearAllMocks(); });

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

test("mousedown outside tooltip triggers onClose", async () => {
  render(<VocabWordTooltip {...BASE} />);
  await flushPromises();

  const outside = document.createElement("div");
  document.body.appendChild(outside);

  await act(async () => {
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });

  expect(BASE.onClose).toHaveBeenCalledTimes(1);
  outside.remove();
});

test("mousedown inside tooltip does NOT trigger onClose", async () => {
  render(<VocabWordTooltip {...BASE} />);
  await flushPromises();

  // The tooltip is a fixed div; click inside it
  const tooltip = document.querySelector(".fixed.z-50.w-72") as HTMLElement;
  expect(tooltip).toBeTruthy();

  await act(async () => {
    tooltip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });

  expect(BASE.onClose).not.toHaveBeenCalled();
});

test("clicking Save twice only calls onSave once (saved guard)", async () => {
  render(<VocabWordTooltip {...BASE} />);
  await waitFor(() => expect(screen.getByText("a sea monster")).toBeInTheDocument());

  const saveBtn = screen.getByRole("button", { name: /Save to vocab/i });
  await userEvent.click(saveBtn);

  expect(BASE.onSave).toHaveBeenCalledTimes(1);

  // Button is now disabled and shows "Saved ✓" — fire a raw click to hit line 57
  const savedBtn = screen.getByRole("button", { name: /Saved/i });
  savedBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  expect(BASE.onSave).toHaveBeenCalledTimes(1);
});

test("right-edge rect clamps tooltip left position", async () => {
  const origInnerWidth = window.innerWidth;
  Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });

  // rect.left=380 → left = 380 + 50 - 144 = 286; 286 + 288 = 574 > 400-8=392 → clamped to 400-288-8=104
  render(<VocabWordTooltip {...BASE} rect={makeRect({ left: 380, right: 430, width: 50 })} />);
  await flushPromises();

  const tooltip = document.querySelector(".fixed.z-50.w-72") as HTMLElement;
  const leftStyle = parseFloat(tooltip?.style.left ?? "0");
  expect(leftStyle).toBe(104);

  Object.defineProperty(window, "innerWidth", { value: origInnerWidth, configurable: true });
});

test("pressing Escape calls onClose (line 41)", async () => {
  render(<VocabWordTooltip {...BASE} />);
  await flushPromises();

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  expect(BASE.onClose).toHaveBeenCalledTimes(1);
});

test("pressing a non-Escape key does NOT call onClose (line 41 false branch)", async () => {
  render(<VocabWordTooltip {...BASE} />);
  await flushPromises();

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });

  expect(BASE.onClose).not.toHaveBeenCalled();
});

test("bottom-overflow rect positions tooltip above selection", async () => {
  const origInnerHeight = window.innerHeight;
  Object.defineProperty(window, "innerHeight", { value: 400, configurable: true });

  // rect.bottom=380 → top = 380+8 = 388; 388+220 = 608 > 400-8=392 → top = rect.top - 220 - 8
  render(<VocabWordTooltip {...BASE} rect={makeRect({ top: 350, bottom: 380 })} />);
  await flushPromises();

  const tooltip = document.querySelector(".fixed.z-50.w-72") as HTMLElement;
  const topStyle = parseFloat(tooltip?.style.top ?? "0");
  // Expected: rect.top - tooltipH - 8 = 350 - 220 - 8 = 122
  expect(topStyle).toBe(122);

  Object.defineProperty(window, "innerHeight", { value: origInnerHeight, configurable: true });
});

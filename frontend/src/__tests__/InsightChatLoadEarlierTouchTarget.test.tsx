/**
 * Regression test for issue #623 — InsightChat 'Load earlier' button below 44px.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.mock("@/lib/api", () => ({
  getInsight: jest.fn().mockResolvedValue({ insight: "Insight." }),
  askQuestion: jest.fn().mockResolvedValue({ answer: "Answer." }),
}));

jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn().mockReturnValue({ insightLang: "en", chatFontSize: "xs" }),
  saveSettings: jest.fn(),
}));

import InsightChat from "@/components/InsightChat";

const INITIAL_DISPLAY = 30;

const BASE = {
  bookId: "42",
  userId: 1,
  hasGeminiKey: true,
  isVisible: true,
  chapterText: "Call me Ishmael.",
  chapterTitle: "Chapter 1",
  selectedText: "",
  bookTitle: "Moby Dick",
  author: "Herman Melville",
  bookLanguage: "en",
};

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test("'Load earlier' button has min-h-[44px] when visible", async () => {
  // Seed localStorage with more messages than LOAD_BATCH to show the "Load earlier" button
  const historyKey = `chat-history:1:42`;
  const messages = Array.from({ length: INITIAL_DISPLAY + 5 }, (_, i) => ({
    role: i % 2 === 0 ? "assistant" : "user",
    content: `Message ${i}`,
    isChapterHeader: false,
  }));
  localStorage.setItem(historyKey, JSON.stringify(messages));

  render(<InsightChat {...BASE} />);

  // Wait for the Load earlier button to appear
  await waitFor(() => {
    const btn = document.querySelector("button[class*='Load earlier']") ??
      Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Load earlier")
      );
    expect(btn).not.toBeNull();
    return btn;
  });

  const loadBtn = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.includes("Load earlier")
  );
  expect(loadBtn).not.toBeUndefined();
  expect(loadBtn!.className).toContain("min-h-[44px]");
});

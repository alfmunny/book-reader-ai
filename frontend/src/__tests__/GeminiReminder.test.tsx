/**
 * Tests for the Gemini API key reminder.
 *
 * The reminder banner lives inline in page.tsx, so we test the behaviour
 * through a lightweight harness that mirrors the exact same logic:
 *   - notifyAIUsed() sets the banner visible once
 *   - banner is not shown when the user already has a Gemini key (live fetch)
 *   - banner is not shown during the optimistic window before the live fetch resolves
 *   - banner is hidden after the user dismisses it
 *   - calling notifyAIUsed() multiple times only shows the banner once
 */

import React, { useRef, useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

// ── Minimal harness that replicates the reminder logic from page.tsx ─────────
//
// initialHasKey: the optimistic value before the live /user/me fetch resolves
//                (in production this starts as `true`)
// resolvedHasKey: what the live fetch returns (set via the "resolve key" button)

interface HarnessProps {
  initialHasKey?: boolean;
}

function ReminderHarness({ initialHasKey = true }: HarnessProps) {
  const [hasGeminiKey, setHasGeminiKey] = useState(initialHasKey);
  const [geminiReminderVisible, setGeminiReminderVisible] = useState(false);
  const geminiReminderShown = useRef(false);

  function notifyAIUsed() {
    if (!hasGeminiKey && !geminiReminderShown.current) {
      geminiReminderShown.current = true;
      setGeminiReminderVisible(true);
    }
  }

  return (
    <div>
      {geminiReminderVisible && (
        <div role="alert" data-testid="gemini-banner">
          AI features require your own Gemini API key.{" "}
          <a href="/profile">Add your free Gemini API key</a>
          {" "}to enable them.
          <button
            onClick={() => setGeminiReminderVisible(false)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      <button onClick={notifyAIUsed} data-testid="trigger">
        Trigger AI call
      </button>
      {/* Simulate live /user/me fetch resolving */}
      <button onClick={() => setHasGeminiKey(true)} data-testid="set-has-key">
        Set has key
      </button>
      <button onClick={() => setHasGeminiKey(false)} data-testid="set-no-key">
        Set no key
      </button>
    </div>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Gemini key reminder banner", () => {
  it("is hidden on initial render", () => {
    render(<ReminderHarness initialHasKey={false} />);
    expect(screen.queryByTestId("gemini-banner")).not.toBeInTheDocument();
  });

  it("appears after the first AI call when user has no Gemini key", () => {
    render(<ReminderHarness initialHasKey={false} />);
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.getByTestId("gemini-banner")).toBeInTheDocument();
  });

  it("links to the profile page", () => {
    render(<ReminderHarness initialHasKey={false} />);
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.getByRole("link", { name: /add your free gemini api key/i })).toHaveAttribute(
      "href",
      "/profile"
    );
  });

  it("does NOT appear when user already has a Gemini key", () => {
    // initialHasKey defaults to true — mirrors the live /user/me fetch returning hasGeminiKey: true
    render(<ReminderHarness initialHasKey={true} />);
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.queryByTestId("gemini-banner")).not.toBeInTheDocument();
  });

  it("does NOT appear during the optimistic window (before live fetch resolves)", () => {
    // On mount, hasGeminiKey=true (optimistic). AI call fires before fetch resolves.
    render(<ReminderHarness initialHasKey={true} />);
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.queryByTestId("gemini-banner")).not.toBeInTheDocument();
  });

  it("does NOT appear if the live fetch resolves with hasGeminiKey=true before any AI call", () => {
    render(<ReminderHarness initialHasKey={false} />);
    // Simulate fetch resolving: user has a key
    act(() => { fireEvent.click(screen.getByTestId("set-has-key")); });
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.queryByTestId("gemini-banner")).not.toBeInTheDocument();
  });

  it("appears if the live fetch resolves with hasGeminiKey=false before the AI call", () => {
    render(<ReminderHarness initialHasKey={true} />);
    // Simulate fetch resolving: user has no key
    act(() => { fireEvent.click(screen.getByTestId("set-no-key")); });
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.getByTestId("gemini-banner")).toBeInTheDocument();
  });

  it("shows only once even when notifyAIUsed is called multiple times", () => {
    render(<ReminderHarness initialHasKey={false} />);
    const trigger = screen.getByTestId("trigger");
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.getAllByTestId("gemini-banner")).toHaveLength(1);
  });

  it("disappears when the user dismisses it", () => {
    render(<ReminderHarness initialHasKey={false} />);
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.getByTestId("gemini-banner")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByTestId("gemini-banner")).not.toBeInTheDocument();
  });
});

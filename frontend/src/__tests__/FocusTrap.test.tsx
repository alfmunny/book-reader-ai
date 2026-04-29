/**
 * Regression test for #2083 — modal dialogs must trap keyboard focus within
 * the dialog container while it is open (ARIA APG Dialog pattern).
 *
 * Tests that Tab wraps from last to first focusable element,
 * and Shift+Tab wraps from first to last.
 */
import React, { useRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useFocusTrap } from "@/lib/useFocusTrap";

function TestDialog({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, enabled);
  return (
    <div>
      <button data-testid="outside">Outside button</button>
      <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
        <button data-testid="first">First</button>
        <button data-testid="second">Second</button>
        <button data-testid="last">Last</button>
      </div>
    </div>
  );
}

describe("useFocusTrap (closes #2083)", () => {
  it("Tab from last focusable wraps to first", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);
    screen.getByTestId("last").focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId("first"));
  });

  it("Shift+Tab from first focusable wraps to last", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);
    screen.getByTestId("first").focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByTestId("last"));
  });

  it("Tab in the middle does not wrap", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);
    screen.getByTestId("first").focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId("second"));
  });

  it("does not trap when disabled", async () => {
    const user = userEvent.setup();
    render(<TestDialog enabled={false} />);
    screen.getByTestId("last").focus();
    await user.tab();
    // focus moves to outside button (natural tab order)
    expect(document.activeElement).not.toBe(screen.getByTestId("first"));
  });
});

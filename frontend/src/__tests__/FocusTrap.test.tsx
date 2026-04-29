/**
 * Regression test for #2083 — modal dialogs must trap keyboard focus within
 * the dialog container while it is open (ARIA APG Dialog pattern).
 *
 * Tests that Tab wraps from last to first focusable element,
 * and Shift+Tab wraps from first to last.
 * Branch coverage for #2206: empty dialog, dialog-element active, inert filtering.
 */
import React, { useRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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

function EmptyDialog() {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} data-testid="empty-dialog">
      <span>No focusable children</span>
    </div>
  );
}

function InertDialog() {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
      {/* visible button is the only real focusable element */}
      <button data-testid="real">Real</button>
      {/* inert subtree — its button should be excluded from trap */}
      <div inert="" aria-hidden="true">
        <button data-testid="inert-btn">Hidden</button>
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

  it("Shift+Tab from middle element does not wrap (closes #2206)", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);
    screen.getByTestId("second").focus();
    await user.tab({ shift: true });
    // active is "second" — neither first nor dialog container — so no wrap, focus moves to "first"
    expect(document.activeElement).toBe(screen.getByTestId("first"));
  });

  it("prevents Tab when dialog has no focusable children (closes #2206)", () => {
    render(<EmptyDialog />);
    const dialog = screen.getByTestId("empty-dialog");
    dialog.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    dialog.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Shift+Tab from dialog container element wraps to last focusable (closes #2206)", () => {
    render(<TestDialog />);
    // Focus the dialog container div (tabIndex={-1}) directly — not a child button
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    dialog.focus();
    expect(document.activeElement).toBe(dialog);
    // Fire keydown directly so our listener (not userEvent's simulation) handles it
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    expect(document.activeElement).toBe(screen.getByTestId("last"));
  });

  it("excludes inert subtree elements from focus cycle (closes #2206)", async () => {
    const user = userEvent.setup();
    render(<InertDialog />);
    const real = screen.getByTestId("real");
    real.focus();
    // Tab from the only real focusable should wrap back to itself (not the inert button)
    await user.tab();
    expect(document.activeElement).toBe(real);
  });
});

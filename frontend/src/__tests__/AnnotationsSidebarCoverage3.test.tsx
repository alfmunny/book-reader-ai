/**
 * Coverage tests for components/AnnotationsSidebar.tsx — functions not covered by existing tests.
 * Closes #1993 — targets:
 *   FN:56  onKey — Escape keydown handler (document listener, only active when sidebar is open)
 *   FN:138 onKeyDown — keyboard activation (Enter / Space) on annotation card
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnnotationsSidebar from "@/components/AnnotationsSidebar";
import type { Annotation } from "@/lib/api";

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 1, book_id: 1, chapter_index: 0,
    sentence_text: "Some selected sentence.", note_text: "A note.", color: "yellow",
    ...overrides,
  };
}

const BASE_PROPS = {
  annotations: [] as Annotation[],
  totalCount: 0,
  onJump: jest.fn(),
  onEdit: jest.fn(),
  loading: false,
};

beforeEach(() => jest.clearAllMocks());

// ── onKey — Escape closes the sidebar (FN:56) ─────────────────────────────────

test("pressing Escape while sidebar is open closes it", async () => {
  render(<AnnotationsSidebar {...BASE_PROPS} />);

  // Open sidebar
  await userEvent.click(screen.getByTestId("annotations-toggle"));
  expect(screen.getByTestId("annotations-sidebar")).toBeInTheDocument();

  // Fire Escape — onKey function should set open to false
  fireEvent.keyDown(document, { key: "Escape" });

  expect(screen.queryByTestId("annotations-sidebar")).not.toBeInTheDocument();
});

test("Escape keydown is a no-op when the sidebar is already closed", () => {
  render(<AnnotationsSidebar {...BASE_PROPS} />);
  // Sidebar is closed — listener not attached, so this should be a no-op
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByTestId("annotations-sidebar")).not.toBeInTheDocument();
});

// ── onKeyDown — Enter / Space activates annotation card (FN:138) ──────────────

test("pressing Enter on an annotation card calls onJump and closes the sidebar", async () => {
  const ann = makeAnnotation({ id: 42 });
  render(
    <AnnotationsSidebar
      {...BASE_PROPS}
      annotations={[ann]}
      totalCount={1}
    />,
  );

  // Open sidebar
  await userEvent.click(screen.getByTestId("annotations-toggle"));

  // Find annotation card (role="button") and fire Enter
  const card = screen.getByRole("button", {
    name: /jump to annotation/i,
  });
  fireEvent.keyDown(card, { key: "Enter" });

  expect(BASE_PROPS.onJump).toHaveBeenCalledWith(ann);
  expect(screen.queryByTestId("annotations-sidebar")).not.toBeInTheDocument();
});

test("pressing Space on an annotation card calls onJump and closes the sidebar", async () => {
  const ann = makeAnnotation({ id: 43 });
  render(
    <AnnotationsSidebar
      {...BASE_PROPS}
      annotations={[ann]}
      totalCount={1}
    />,
  );

  await userEvent.click(screen.getByTestId("annotations-toggle"));

  const card = screen.getByRole("button", { name: /jump to annotation/i });
  fireEvent.keyDown(card, { key: " " });

  expect(BASE_PROPS.onJump).toHaveBeenCalledWith(ann);
  expect(screen.queryByTestId("annotations-sidebar")).not.toBeInTheDocument();
});

test("pressing Tab on an annotation card does NOT call onJump", async () => {
  const ann = makeAnnotation({ id: 44 });
  render(
    <AnnotationsSidebar
      {...BASE_PROPS}
      annotations={[ann]}
      totalCount={1}
    />,
  );

  await userEvent.click(screen.getByTestId("annotations-toggle"));

  const card = screen.getByRole("button", { name: /jump to annotation/i });
  fireEvent.keyDown(card, { key: "Tab" });

  expect(BASE_PROPS.onJump).not.toHaveBeenCalled();
});

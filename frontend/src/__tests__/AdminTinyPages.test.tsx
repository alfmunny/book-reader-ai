/**
 * Tests for small admin pages that are currently at 0% coverage.
 *   - src/app/admin/page.tsx       — redirects to /admin/users
 *   - src/app/admin/queue/page.tsx — renders QueueTab
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

// ─── next/navigation ─────────────────────────────────────────────────────────
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// ─── Heavy child components ────────────────────────────────────────────────
jest.mock("@/components/QueueTab", () => {
  const QueueTab = () => <div data-testid="queue-tab" />;
  QueueTab.displayName = "QueueTab";
  return { __esModule: true, default: QueueTab };
});

// adminFetch is passed as a prop — the import just needs to exist
jest.mock("@/lib/adminFetch", () => ({
  adminFetch: jest.fn(),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Admin index page (admin/page.tsx)", () => {
  let AdminIndex: React.ComponentType;

  beforeAll(async () => {
    const mod = await import("@/app/admin/page");
    AdminIndex = mod.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<AdminIndex />);
    // The component returns null and fires router.replace
  });

  it("calls router.replace('/admin/users') on mount", async () => {
    render(<AdminIndex />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/admin/users");
    });
  });

  it("renders nothing visible (returns null)", () => {
    const { container } = render(<AdminIndex />);
    expect(container.firstChild).toBeNull();
  });
});

describe("Admin queue page (admin/queue/page.tsx)", () => {
  let QueuePage: React.ComponentType;

  beforeAll(async () => {
    const mod = await import("@/app/admin/queue/page");
    QueuePage = mod.default;
  });

  it("renders without crashing", () => {
    render(<QueuePage />);
  });

  it("renders the QueueTab component", () => {
    render(<QueuePage />);
    expect(screen.getByTestId("queue-tab")).toBeInTheDocument();
  });
});

describe("Admin bulk redirect page (admin/bulk/page.tsx)", () => {
  let BulkRedirect: React.ComponentType;

  beforeAll(async () => {
    const mod = await import("@/app/admin/bulk/page");
    BulkRedirect = mod.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<BulkRedirect />);
  });

  it("calls router.replace('/admin/queue') on mount", async () => {
    render(<BulkRedirect />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/admin/queue");
    });
  });

  it("renders nothing visible (returns null)", () => {
    const { container } = render(<BulkRedirect />);
    expect(container.firstChild).toBeNull();
  });
});

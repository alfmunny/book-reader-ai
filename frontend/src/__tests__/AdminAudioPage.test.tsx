/**
 * Tests for the admin audio page.
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAdminFetch = jest.fn();
jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

let AudioPage: React.ComponentType;
beforeAll(async () => {
  const mod = await import("@/app/admin/audio/page");
  AudioPage = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
});

const SAMPLE_AUDIO = [
  {
    book_id: 1,
    chapter_index: 0,
    provider: "google",
    voice: "en-US-Standard-A",
    chunks: 12,
    size_mb: 3.5,
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    book_id: 2,
    chapter_index: 2,
    provider: "openai",
    voice: "alloy",
    chunks: 8,
    size_mb: 1.2,
    created_at: "2024-01-02T00:00:00Z",
  },
];

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

describe("AdminAudioPage", () => {
  it("shows loading spinner initially", async () => {
    mockAdminFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AudioPage />);
    // The spinner has animate-spin class
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders audio entries after load", async () => {
    mockAdminFetch.mockResolvedValue(SAMPLE_AUDIO);
    render(<AudioPage />);
    await flushPromises();
    expect(await screen.findByText("Book 1, Ch. 1")).toBeInTheDocument();
    expect(screen.getByText("Book 2, Ch. 3")).toBeInTheDocument();
  });

  it("renders provider/voice/chunks/size for each entry", async () => {
    mockAdminFetch.mockResolvedValue(SAMPLE_AUDIO);
    render(<AudioPage />);
    await flushPromises();
    expect(await screen.findByText(/google\/en-US-Standard-A · 12 chunks · 3\.5 MB/)).toBeInTheDocument();
    expect(screen.getByText(/openai\/alloy · 8 chunks · 1\.2 MB/)).toBeInTheDocument();
  });

  it("renders a Delete button for each entry", async () => {
    mockAdminFetch.mockResolvedValue(SAMPLE_AUDIO);
    render(<AudioPage />);
    await flushPromises();
    const deleteBtns = await screen.findAllByRole("button", { name: /delete/i });
    expect(deleteBtns).toHaveLength(2);
  });

  it("shows empty state when no audio cached", async () => {
    mockAdminFetch.mockResolvedValue([]);
    render(<AudioPage />);
    await flushPromises();
    expect(await screen.findByText(/no audio cached/i)).toBeInTheDocument();
  });

  it("shows error message when fetch fails", async () => {
    mockAdminFetch.mockRejectedValue(new Error("Network error"));
    render(<AudioPage />);
    await flushPromises();
    expect(await screen.findByText("Network error")).toBeInTheDocument();
  });

  it("shows generic error when non-Error is thrown", async () => {
    mockAdminFetch.mockRejectedValue("oops");
    render(<AudioPage />);
    await flushPromises();
    expect(await screen.findByText("Failed to load audio")).toBeInTheDocument();
  });

  it("calls DELETE endpoint when Delete button is clicked", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_AUDIO) // initial load
      .mockResolvedValueOnce({})           // DELETE
      .mockResolvedValueOnce(SAMPLE_AUDIO); // reload
    render(<AudioPage />);
    await flushPromises();

    const [firstDelete] = await screen.findAllByRole("button", { name: /delete/i });
    await userEvent.click(firstDelete);

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith(
        "/admin/audio/1/0",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("reloads data after a delete action", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_AUDIO)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([SAMPLE_AUDIO[1]]); // only one entry after delete
    render(<AudioPage />);
    await flushPromises();

    const [firstDelete] = await screen.findAllByRole("button", { name: /delete/i });
    await userEvent.click(firstDelete);

    await waitFor(() => expect(mockAdminFetch).toHaveBeenCalledTimes(3));
  });

  it("alerts with error message when delete action throws Error", async () => {
    jest.spyOn(window, "alert").mockImplementation(() => {});
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_AUDIO)
      .mockRejectedValueOnce(new Error("Delete failed"));
    render(<AudioPage />);
    await flushPromises();

    const [firstDelete] = await screen.findAllByRole("button", { name: /delete/i });
    await userEvent.click(firstDelete);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("Delete failed"));
  });

  it("alerts 'Failed' when delete action throws non-Error", async () => {
    jest.spyOn(window, "alert").mockImplementation(() => {});
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_AUDIO)
      .mockRejectedValueOnce("oops");
    render(<AudioPage />);
    await flushPromises();

    const [firstDelete] = await screen.findAllByRole("button", { name: /delete/i });
    await userEvent.click(firstDelete);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("Failed"));
  });
});

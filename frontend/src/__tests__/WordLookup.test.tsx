/**
 * Tests for components/WordLookup.tsx
 * A floating lookup card that shows a word's definition.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WordLookup from "@/components/WordLookup";

const DEFAULT_POSITION = { x: 200, y: 300 };

const mockDictionaryEntry = {
  word: "serendipity",
  phonetic: "/ˌsɛrənˈdɪpɪti/",
  meanings: [
    {
      partOfSpeech: "noun",
      definitions: [
        { definition: "The occurrence of events by chance in a happy or beneficial way." },
        { definition: "A pleasant surprise." },
      ],
    },
    {
      partOfSpeech: "verb",
      definitions: [
        { definition: "To discover by happy accident." },
      ],
    },
  ],
};

function setupFetchMock(ok = true, data: unknown = [mockDictionaryEntry]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: jest.fn().mockResolvedValue(data),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupFetchMock();
});

describe("WordLookup rendering", () => {
  it("renders the component for a valid word", () => {
    const { container } = render(
      <WordLookup
        word="serendipity"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("shows loading state initially", () => {
    // Keep fetch pending
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(
      <WordLookup
        word="serendipity"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByText(/Looking up.*serendipity/i)).toBeInTheDocument();
  });

  it("shows the word being looked up in loading message", () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(
      <WordLookup
        word="eloquent"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByText(/eloquent/i)).toBeInTheDocument();
  });

  it("shows word heading after successful lookup", async () => {
    render(
      <WordLookup
        word="serendipity"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("serendipity")).toBeInTheDocument();
    });
  });

  it("shows phonetic when returned by dictionary", async () => {
    render(
      <WordLookup
        word="serendipity"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("/ˌsɛrənˈdɪpɪti/")).toBeInTheDocument();
    });
  });

  it("shows first definition after successful lookup", async () => {
    render(
      <WordLookup
        word="serendipity"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(
        screen.getByText("The occurrence of events by chance in a happy or beneficial way.")
      ).toBeInTheDocument();
    });
  });

  it("shows part of speech label", async () => {
    render(
      <WordLookup
        word="serendipity"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("noun")).toBeInTheDocument();
    });
  });

  it("shows multiple meanings", async () => {
    render(
      <WordLookup
        word="serendipity"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("noun")).toBeInTheDocument();
      expect(screen.getByText("verb")).toBeInTheDocument();
    });
  });

  it("shows error when word not found", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: jest.fn() });
    render(
      <WordLookup
        word="xyzzy"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/no definition found/i)).toBeInTheDocument();
    });
  });

  it("shows error message with word in it when not found", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: jest.fn() });
    render(
      <WordLookup
        word="xyzzy"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/xyzzy/i)).toBeInTheDocument();
    });
  });

  it("hides loading indicator after fetch completes", async () => {
    render(
      <WordLookup
        word="serendipity"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.queryByText(/Looking up/i)).not.toBeInTheDocument();
    });
  });
});

describe("WordLookup positioning", () => {
  it("renders with a fixed position style", () => {
    const { container } = render(
      <WordLookup
        word="serendipity"
        position={{ x: 100, y: 200 }}
        onClose={jest.fn()}
      />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.position).toBe("fixed");
    expect(el.style.zIndex).toBe("50");
  });
});

describe("WordLookup dismissal", () => {
  it("calls onClose when Escape key is pressed", () => {
    const onClose = jest.fn();
    render(
      <WordLookup
        word="serendipity"
        position={DEFAULT_POSITION}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when clicking outside the popup", () => {
    const onClose = jest.fn();
    render(
      <WordLookup
        word="serendipity"
        position={DEFAULT_POSITION}
        onClose={onClose}
      />
    );
    // Click on document body (outside the popup)
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when clicking inside the popup", () => {
    const onClose = jest.fn();
    const { container } = render(
      <WordLookup
        word="serendipity"
        position={DEFAULT_POSITION}
        onClose={onClose}
      />
    );
    // Click inside the popup container
    fireEvent.mouseDown(container.firstChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("WordLookup re-fetch on word change", () => {
  it("re-fetches when word prop changes and shows new result", async () => {
    const { rerender } = render(
      <WordLookup
        word="serendipity"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );

    // Wait for first fetch to complete
    await waitFor(() => {
      expect(screen.getByText("serendipity")).toBeInTheDocument();
    });

    // Set up mock for new word before rerender
    const newEntry = { ...mockDictionaryEntry, word: "ephemeral", phonetic: "/ɪˈfem.ər.əl/" };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([newEntry]),
    });

    rerender(
      <WordLookup
        word="ephemeral"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );

    // Should fetch for new word
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("ephemeral");
  });

  it("fetches using lowercase word", async () => {
    render(
      <WordLookup
        word="SERENDIPITY"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain("serendipity");
    });
  });
});

describe("WordLookup mobile layout", () => {
  it("uses fixed bottom layout on narrow viewport (isMobile=true)", async () => {
    Object.defineProperty(window, "innerWidth", { value: 400, writable: true, configurable: true });
    const { container } = render(
      <WordLookup word="hello" position={DEFAULT_POSITION} onClose={jest.fn()} />
    );
    const popup = container.firstElementChild as HTMLElement;
    // On mobile the style has bottom: 8 instead of top
    expect(popup.style.bottom).toBe("8px");
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true, configurable: true });
  });
});

describe("WordLookup fetch URL", () => {
  it("fetches from dictionaryapi.dev with encoded word", async () => {
    render(
      <WordLookup
        word="café"
        position={DEFAULT_POSITION}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain("dictionaryapi.dev");
      expect(url).toContain(encodeURIComponent("café".toLowerCase()));
    });
  });
});

/**
 * Tests for components/WordActionDrawer.tsx
 * A bottom drawer that shows word actions (look up, save vocabulary, annotate).
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import WordActionDrawer from "@/components/WordActionDrawer";
import type { WordAction } from "@/components/WordActionDrawer";

// Mock the dictionary API fetch
const mockDictionaryEntry = {
  word: "hello",
  phonetic: "/həˈloʊ/",
  meanings: [
    {
      partOfSpeech: "exclamation",
      definitions: [
        { definition: "Used as a greeting." },
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

const BASE_ACTION: WordAction = {
  word: "hello",
  sentenceText: "Hello world.",
  segmentStartTime: 1.5,
  chapterIndex: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  setupFetchMock();
});

describe("WordActionDrawer with null action", () => {
  it("renders nothing when action is null", () => {
    const { container } = render(
      <WordActionDrawer action={null} onClose={jest.fn()} />
    );
    // Nothing rendered except the root container
    expect(container.firstChild).toBeNull();
  });
});

describe("WordActionDrawer rendering", () => {
  it("shows the word in the drawer header", async () => {
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows loading state while fetching definition", () => {
    // Don't resolve the fetch immediately
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByText(/looking up/i)).toBeInTheDocument();
  });

  it("shows definition after successful lookup", async () => {
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Used as a greeting.")).toBeInTheDocument();
    });
  });

  it("shows phonetic when returned by dictionary", async () => {
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("/həˈloʊ/")).toBeInTheDocument();
    });
  });

  it("shows error message when definition not found", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: jest.fn() });
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/no definition found/i)).toBeInTheDocument();
    });
  });

  it("shows translation context when translationText is provided", async () => {
    const actionWithTranslation: WordAction = {
      ...BASE_ACTION,
      translationText: "Hallo Welt.",
    };
    render(
      <WordActionDrawer
        action={actionWithTranslation}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Hallo Welt.")).toBeInTheDocument();
    });
  });

  it("shows backdrop overlay when action is present", () => {
    const { container } = render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
      />
    );
    // Backdrop is a fixed div with bg-black/10
    const backdrop = container.querySelector(".bg-black\\/10");
    expect(backdrop).toBeTruthy();
  });
});

describe("WordActionDrawer action buttons", () => {
  it("shows Read button when onReadSentence is provided", () => {
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
        onReadSentence={jest.fn()}
      />
    );
    expect(screen.getByText(/Read/)).toBeInTheDocument();
  });

  it("does not show Read button when onReadSentence is not provided", () => {
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
      />
    );
    expect(screen.queryByText(/🔊 Read/)).not.toBeInTheDocument();
  });

  it("shows Save button when onSaveWord is provided", () => {
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
        onSaveWord={jest.fn()}
      />
    );
    expect(screen.getByText(/💾 Save/)).toBeInTheDocument();
  });

  it("does not show Save button when onSaveWord is not provided", () => {
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
      />
    );
    expect(screen.queryByText(/Save/)).not.toBeInTheDocument();
  });

  it("shows Note button when onAnnotate is provided", () => {
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
        onAnnotate={jest.fn()}
      />
    );
    expect(screen.getByText(/📝 Note/)).toBeInTheDocument();
  });

  it("does not show Note button when onAnnotate is not provided", () => {
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
      />
    );
    expect(screen.queryByText(/Note/)).not.toBeInTheDocument();
  });
});

describe("WordActionDrawer callbacks", () => {
  it("calls onReadSentence with correct args and closes", async () => {
    const onReadSentence = jest.fn();
    const onClose = jest.fn();
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={onClose}
        onReadSentence={onReadSentence}
      />
    );

    fireEvent.click(screen.getByText(/Read/));

    expect(onReadSentence).toHaveBeenCalledWith("Hello world.", 1.5);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onSaveWord with word and sentence text", async () => {
    const onSaveWord = jest.fn();
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
        onSaveWord={onSaveWord}
      />
    );

    fireEvent.click(screen.getByText(/💾 Save/));

    expect(onSaveWord).toHaveBeenCalledWith("hello", "Hello world.");
  });

  it("shows Saved state after saving word", async () => {
    const onSaveWord = jest.fn();
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
        onSaveWord={onSaveWord}
      />
    );

    fireEvent.click(screen.getByText(/💾 Save/));

    await waitFor(() => {
      expect(screen.getByText(/✓ Saved/)).toBeInTheDocument();
    });
  });

  it("save button becomes disabled after saving", async () => {
    const onSaveWord = jest.fn();
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
        onSaveWord={onSaveWord}
      />
    );

    const saveBtn = screen.getByText(/💾 Save/).closest("button")!;
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(saveBtn).toBeDisabled();
    });
  });

  it("does not call onSaveWord twice when save button clicked again after saved", async () => {
    const onSaveWord = jest.fn();
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={jest.fn()}
        onSaveWord={onSaveWord}
      />
    );

    const saveBtn = screen.getByText(/💾 Save/).closest("button")!;
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn);

    expect(onSaveWord).toHaveBeenCalledTimes(1);
  });

  it("calls onAnnotate with sentence text and chapter index and closes", () => {
    const onAnnotate = jest.fn();
    const onClose = jest.fn();
    render(
      <WordActionDrawer
        action={{ ...BASE_ACTION, chapterIndex: 3 }}
        onClose={onClose}
        onAnnotate={onAnnotate}
      />
    );

    fireEvent.click(screen.getByText(/📝 Note/));

    expect(onAnnotate).toHaveBeenCalledWith("Hello world.", 3);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("WordActionDrawer dismissal", () => {
  it("calls onClose when backdrop is clicked", () => {
    const onClose = jest.fn();
    const { container } = render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={onClose}
      />
    );

    const backdrop = container.querySelector(".bg-black\\/10");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = jest.fn();
    render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not trigger Escape listener when action is null", () => {
    const onClose = jest.fn();
    render(
      <WordActionDrawer
        action={null}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("WordActionDrawer re-fetches on word change", () => {
  it("resets saved state when action changes to different word", async () => {
    const onSaveWord = jest.fn();
    const onClose = jest.fn();
    const { rerender } = render(
      <WordActionDrawer
        action={BASE_ACTION}
        onClose={onClose}
        onSaveWord={onSaveWord}
      />
    );

    // Save the word
    fireEvent.click(screen.getByText(/💾 Save/));
    await waitFor(() => {
      expect(screen.getByText(/✓ Saved/)).toBeInTheDocument();
    });

    // Change to a different word
    setupFetchMock(true, [{ ...mockDictionaryEntry, word: "world" }]);
    rerender(
      <WordActionDrawer
        action={{ ...BASE_ACTION, word: "world" }}
        onClose={onClose}
        onSaveWord={onSaveWord}
      />
    );

    // The Save button should be reset (not showing "Saved")
    await waitFor(() => {
      expect(screen.getByText(/💾 Save/)).toBeInTheDocument();
    });
  });
});

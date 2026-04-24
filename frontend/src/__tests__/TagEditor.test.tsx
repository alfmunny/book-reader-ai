import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/lib/api", () => ({
  listVocabularyTags: jest.fn().mockResolvedValue([]),
  getVocabularyWordTags: jest.fn(),
  addVocabularyWordTag: jest.fn(),
  removeVocabularyWordTag: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import * as api from "@/lib/api";
import TagEditor from "@/components/TagEditor";

const mockGetTags = api.getVocabularyWordTags as jest.MockedFunction<
  typeof api.getVocabularyWordTags
>;
const mockAddTag = api.addVocabularyWordTag as jest.MockedFunction<
  typeof api.addVocabularyWordTag
>;
const mockRemoveTag = api.removeVocabularyWordTag as jest.MockedFunction<
  typeof api.removeVocabularyWordTag
>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("TagEditor", () => {
  it("renders supplied initial tags without fetching", async () => {
    render(
      <TagEditor vocabularyId={42} initialTags={["verb", "b2"]} />,
    );
    expect(screen.getByTestId("tag-chip-verb")).toBeInTheDocument();
    expect(screen.getByTestId("tag-chip-b2")).toBeInTheDocument();
    expect(mockGetTags).not.toHaveBeenCalled();
  });

  it("fetches tags when no initialTags provided", async () => {
    mockGetTags.mockResolvedValue(["idiom"]);
    render(<TagEditor vocabularyId={7} />);
    await waitFor(() => {
      expect(screen.getByTestId("tag-chip-idiom")).toBeInTheDocument();
    });
    expect(mockGetTags).toHaveBeenCalledWith(7);
  });

  it("adds a new tag via keyboard and shows the chip", async () => {
    mockAddTag.mockResolvedValue({ tag: "noun" });
    const onChange = jest.fn();
    render(
      <TagEditor vocabularyId={3} initialTags={[]} onTagsChange={onChange} />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("add-tag-3"));
    const input = await screen.findByTestId("tag-input-3");
    await user.type(input, "Noun{Enter}");

    await waitFor(() => {
      expect(screen.getByTestId("tag-chip-noun")).toBeInTheDocument();
    });
    expect(mockAddTag).toHaveBeenCalledWith(3, "Noun");
    expect(onChange).toHaveBeenLastCalledWith(["noun"]);
  });

  it("removes a tag when its X button is clicked", async () => {
    mockRemoveTag.mockResolvedValue(undefined);
    const onChange = jest.fn();
    render(
      <TagEditor
        vocabularyId={9}
        initialTags={["keep", "drop"]}
        onTagsChange={onChange}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Remove tag drop"));

    await waitFor(() => {
      expect(screen.queryByTestId("tag-chip-drop")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("tag-chip-keep")).toBeInTheDocument();
    expect(mockRemoveTag).toHaveBeenCalledWith(9, "drop");
    expect(onChange).toHaveBeenLastCalledWith(["keep"]);
  });

  it("shows an error message when the backend rejects a tag", async () => {
    const { ApiError } = jest.requireMock("@/lib/api");
    mockAddTag.mockRejectedValue(new ApiError(400, "tag exceeds 50 chars"));
    render(<TagEditor vocabularyId={1} initialTags={[]} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("add-tag-1"));
    const input = await screen.findByTestId("tag-input-1");
    await user.type(input, "something{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "tag exceeds 50 chars",
    );
  });

  it("cancels add mode on Escape without calling the API", async () => {
    render(<TagEditor vocabularyId={5} initialTags={[]} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("add-tag-5"));
    const input = await screen.findByTestId("tag-input-5");
    await user.type(input, "nope{Escape}");

    await waitFor(() => {
      expect(screen.queryByTestId("tag-input-5")).not.toBeInTheDocument();
    });
    expect(mockAddTag).not.toHaveBeenCalled();
  });
});

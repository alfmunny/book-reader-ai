/**
 * Tests for #2704: the dictionary language is selectable, and the meaning the
 * tooltip fetched is handed to the save so it is stored rather than re-fetched
 * on every future click.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGetWordDefinition = jest.fn();

jest.mock("@/lib/api", () => ({
  getWordDefinition: (...args: unknown[]) => mockGetWordDefinition(...args),
}));

import VocabWordTooltip from "@/components/VocabWordTooltip";
import {
  readDictionaryLanguage,
  writeDictionaryLanguage,
  DEFAULT_DICTIONARY_LANGUAGE,
} from "@/lib/dictionaryLanguage";

const RECT = {
  left: 100, top: 200, right: 200, bottom: 220,
  width: 100, height: 20, x: 100, y: 200,
  toJSON: () => ({}),
} as DOMRect;

const EN = {
  lemma: "gehen", language: "de", form_of: null, definition_lang: "en",
  definitions: [{ pos: "verb", text: "to go, to walk" }],
  url: "https://en.wiktionary.org/wiki/gehen",
};
const ZH = {
  lemma: "gehen", language: "de", form_of: null, definition_lang: "zh",
  definitions: [{ pos: "verb", text: "走，行走" }],
  url: "https://zh.wiktionary.org/wiki/gehen",
};

function renderTooltip(overrides: Record<string, unknown> = {}) {
  const onSave = jest.fn();
  const props = { word: "gehen", lang: "de", rect: RECT, onClose: jest.fn(), onSave, ...overrides };
  render(<VocabWordTooltip {...(props as never)} />);
  return { onSave };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockGetWordDefinition.mockResolvedValue(EN);
});

// ── the persistence helper ────────────────────────────────────────────────────

describe("dictionary language persistence", () => {
  it("defaults to English when nothing is stored", () => {
    expect(readDictionaryLanguage()).toBe(DEFAULT_DICTIONARY_LANGUAGE);
  });

  it("round-trips a stored choice", () => {
    writeDictionaryLanguage("zh");
    expect(readDictionaryLanguage()).toBe("zh");
  });

  it("ignores a stored value that is not an offered language", () => {
    window.localStorage.setItem("dictionaryLanguage", "klingon");
    expect(readDictionaryLanguage()).toBe(DEFAULT_DICTIONARY_LANGUAGE);
  });

  it("survives a localStorage that throws", () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readDictionaryLanguage()).toBe(DEFAULT_DICTIONARY_LANGUAGE);
    spy.mockRestore();
  });
});

// ── the picker ────────────────────────────────────────────────────────────────

describe("tooltip dictionary-language picker", () => {
  it("offers a labelled language selector", async () => {
    renderTooltip();
    expect(await screen.findByLabelText(/definition language/i)).toBeInTheDocument();
  });

  it("looks the word up in the stored language on open", async () => {
    writeDictionaryLanguage("zh");
    mockGetWordDefinition.mockResolvedValue(ZH);
    renderTooltip();
    await waitFor(() =>
      expect(mockGetWordDefinition).toHaveBeenCalledWith("gehen", "de", "zh"),
    );
  });

  it("re-fetches in the newly chosen language", async () => {
    const user = userEvent.setup();
    renderTooltip();
    await screen.findByText(/to go, to walk/i);

    mockGetWordDefinition.mockResolvedValue(ZH);
    await user.selectOptions(screen.getByLabelText(/definition language/i), "zh");

    await waitFor(() =>
      expect(mockGetWordDefinition).toHaveBeenLastCalledWith("gehen", "de", "zh"),
    );
    expect(await screen.findByText("走，行走")).toBeInTheDocument();
  });

  it("remembers the choice for the next lookup", async () => {
    const user = userEvent.setup();
    renderTooltip();
    await screen.findByText(/to go, to walk/i);

    mockGetWordDefinition.mockResolvedValue(ZH);
    await user.selectOptions(screen.getByLabelText(/definition language/i), "zh");

    await waitFor(() => expect(readDictionaryLanguage()).toBe("zh"));
  });

  it("says so when the chain fell back to another language", async () => {
    writeDictionaryLanguage("zh");
    // Asked for Chinese, got English back.
    mockGetWordDefinition.mockResolvedValue(EN);
    renderTooltip();
    expect(await screen.findByText(/showing English/i)).toBeInTheDocument();
  });

  it("shows no fallback notice when the language matches", async () => {
    writeDictionaryLanguage("zh");
    mockGetWordDefinition.mockResolvedValue(ZH);
    renderTooltip();
    await screen.findByText("走，行走");
    expect(screen.queryByText(/showing/i)).not.toBeInTheDocument();
  });

  it("names the requested language in the empty state", async () => {
    writeDictionaryLanguage("zh");
    mockGetWordDefinition.mockResolvedValue({ ...ZH, definitions: [] });
    renderTooltip();
    expect(await screen.findByText(/no definition found in 中文/i)).toBeInTheDocument();
  });
});

// ── the definition travels with the save ─────────────────────────────────────

describe("saving stores the fetched meaning", () => {
  it("hands the definition to the save handler", async () => {
    const user = userEvent.setup();
    const { onSave } = renderTooltip();
    await screen.findByText(/to go, to walk/i);

    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith("gehen", expect.objectContaining({
      definitions: EN.definitions,
      definition_lang: "en",
    }));
  });

  it("still saves when the lookup produced nothing", async () => {
    mockGetWordDefinition.mockResolvedValue({ ...EN, definitions: [] });
    const user = userEvent.setup();
    const { onSave } = renderTooltip();
    await screen.findByText(/no definition found/i);

    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith("gehen", expect.objectContaining({ definitions: [] }));
  });
});

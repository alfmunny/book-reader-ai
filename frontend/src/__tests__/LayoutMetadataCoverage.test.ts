/**
 * Branch coverage for generateMetadata in all three dynamic-segment layout files (closes #2033).
 *
 * Covers per layout (3 branches each × 3 files = 9 total):
 *  - binary-expr at line 11: NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
 *  - if (res.ok) — true and false paths
 *  - if (deck?.name) / if (book?.title) — present and absent paths
 *
 * Strategy: import generateMetadata directly and mock global.fetch.
 */

const makeParams = <T extends object>(obj: T) => Promise.resolve(obj);

// ─── Deck layout ─────────────────────────────────────────────────────────────

import { generateMetadata as deckMeta } from "@/app/decks/[deckId]/layout";

describe("app/decks/[deckId]/layout — generateMetadata", () => {
  let origFetch: typeof global.fetch;
  beforeAll(() => { origFetch = global.fetch; });
  afterAll(() => { global.fetch = origFetch; });
  afterEach(() => { global.fetch = origFetch; delete process.env.NEXT_PUBLIC_API_URL; });

  test("res.ok + deck.name present → returns deck name title", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ name: "German Verbs" }),
    }) as jest.Mock;
    const meta = await deckMeta({ params: makeParams({ deckId: "7" }) });
    expect(meta).toEqual({ title: "German Verbs" });
  });

  test("res.ok + deck.name absent → falls back to 'Deck'", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ name: "" }),
    }) as jest.Mock;
    const meta = await deckMeta({ params: makeParams({ deckId: "7" }) });
    expect(meta).toEqual({ title: "Deck" });
  });

  test("res not ok → falls back to 'Deck'", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as jest.Mock;
    const meta = await deckMeta({ params: makeParams({ deckId: "7" }) });
    expect(meta).toEqual({ title: "Deck" });
  });

  test("fetch throws → falls back to 'Deck' (catch branch)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network")) as jest.Mock;
    const meta = await deckMeta({ params: makeParams({ deckId: "7" }) });
    expect(meta).toEqual({ title: "Deck" });
  });

  test("NEXT_PUBLIC_API_URL env set → uses it in fetch URL (binary-expr true branch)", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.test:9000";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ name: "Test" }),
    }) as jest.Mock;
    await deckMeta({ params: makeParams({ deckId: "5" }) });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain("http://api.test:9000");
  });
});

// ─── Notes layout ─────────────────────────────────────────────────────────────

import { generateMetadata as notesMeta } from "@/app/notes/[bookId]/layout";

describe("app/notes/[bookId]/layout — generateMetadata", () => {
  let origFetch: typeof global.fetch;
  beforeAll(() => { origFetch = global.fetch; });
  afterAll(() => { global.fetch = origFetch; });
  afterEach(() => { global.fetch = origFetch; delete process.env.NEXT_PUBLIC_API_URL; });

  test("res.ok + book.title present → returns Notes — <title>", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: "Hamlet" }),
    }) as jest.Mock;
    const meta = await notesMeta({ params: makeParams({ bookId: "1" }) });
    expect(meta).toEqual({ title: "Notes — Hamlet" });
  });

  test("res.ok + book.title absent → falls back to 'Notes'", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: "" }),
    }) as jest.Mock;
    const meta = await notesMeta({ params: makeParams({ bookId: "1" }) });
    expect(meta).toEqual({ title: "Notes" });
  });

  test("res not ok → falls back to 'Notes'", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as jest.Mock;
    const meta = await notesMeta({ params: makeParams({ bookId: "1" }) });
    expect(meta).toEqual({ title: "Notes" });
  });

  test("fetch throws → falls back to 'Notes' (catch branch)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network")) as jest.Mock;
    const meta = await notesMeta({ params: makeParams({ bookId: "1" }) });
    expect(meta).toEqual({ title: "Notes" });
  });

  test("NEXT_PUBLIC_API_URL env set → uses it in fetch URL (binary-expr true branch)", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.test:9000";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: "Test" }),
    }) as jest.Mock;
    await notesMeta({ params: makeParams({ bookId: "1" }) });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain("http://api.test:9000");
  });
});

// ─── Reader layout ────────────────────────────────────────────────────────────

import { generateMetadata as readerMeta } from "@/app/reader/[bookId]/layout";

describe("app/reader/[bookId]/layout — generateMetadata", () => {
  let origFetch: typeof global.fetch;
  beforeAll(() => { origFetch = global.fetch; });
  afterAll(() => { global.fetch = origFetch; });
  afterEach(() => { global.fetch = origFetch; delete process.env.NEXT_PUBLIC_API_URL; });

  test("res.ok + book.title present → returns book title", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: "Moby Dick" }),
    }) as jest.Mock;
    const meta = await readerMeta({ params: makeParams({ bookId: "2" }) });
    expect(meta).toEqual({ title: "Moby Dick" });
  });

  test("res.ok + book.title absent → falls back to 'Reading'", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: "" }),
    }) as jest.Mock;
    const meta = await readerMeta({ params: makeParams({ bookId: "2" }) });
    expect(meta).toEqual({ title: "Reading" });
  });

  test("res not ok → falls back to 'Reading'", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as jest.Mock;
    const meta = await readerMeta({ params: makeParams({ bookId: "2" }) });
    expect(meta).toEqual({ title: "Reading" });
  });

  test("fetch throws → falls back to 'Reading' (catch branch)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network")) as jest.Mock;
    const meta = await readerMeta({ params: makeParams({ bookId: "2" }) });
    expect(meta).toEqual({ title: "Reading" });
  });

  test("NEXT_PUBLIC_API_URL env set → uses it in fetch URL (binary-expr true branch)", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.test:9000";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: "Test" }),
    }) as jest.Mock;
    await readerMeta({ params: makeParams({ bookId: "2" }) });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain("http://api.test:9000");
  });
});

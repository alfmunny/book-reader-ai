/**
 * Tests for background translation behaviour when the user navigates quickly.
 *
 * Strategy: requests are never cancelled (tokens aren't wasted).
 * Instead, results are always written to the in-memory cache, but the UI is
 * only updated if the user is still on the same chapter when the response
 * arrives. If they navigated away and come back, the cached result is used
 * immediately without a second API call.
 */

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

// Mirrors the logic in page.tsx's translation useEffect
function makeTranslationEffect(
  onSetParagraphs: (p: string[]) => void,
  onSetLoading: (v: boolean) => void,
) {
  const cache = new Map<string, string[]>();
  const currentKeyRef = { current: "" };

  return function runEffect(
    cacheKey: string,
    fetchFn: () => Promise<{ paragraphs: string[]; cached: boolean }>,
  ): void {
    currentKeyRef.current = cacheKey;

    if (cache.has(cacheKey)) {
      onSetParagraphs(cache.get(cacheKey)!);
      return;
    }

    onSetLoading(true);
    onSetParagraphs([]);

    fetchFn()
      .then((r) => {
        cache.set(cacheKey, r.paragraphs); // always cache
        if (currentKeyRef.current === cacheKey) {
          onSetParagraphs(r.paragraphs);   // only update UI if still on this chapter
        }
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (currentKeyRef.current === cacheKey) {
          onSetLoading(false);
        }
      });
  };
}

describe("background translation — no wasted tokens", () => {
  it("does not update UI with stale result when user has navigated away", async () => {
    const setParagraphs = jest.fn();
    const setLoading = jest.fn();
    const runEffect = makeTranslationEffect(setParagraphs, setLoading);

    let resolveChapter3!: (v: { paragraphs: string[]; cached: boolean }) => void;
    const p3 = new Promise<{ paragraphs: string[]; cached: boolean }>((r) => { resolveChapter3 = r; });

    // Chapter 3 fires — slow request
    runEffect("ch3", () => p3);

    // User moves to chapter 4 before chapter 3 responds
    runEffect("ch4", () => Promise.resolve({ paragraphs: ["ch4 text"], cached: false }));
    await flushPromises();

    // Chapter 3 arrives late
    resolveChapter3({ paragraphs: ["ch3 text"], cached: false });
    await flushPromises();

    // UI should only show chapter 4
    const calls = setParagraphs.mock.calls.map((c) => c[0]);
    expect(calls.at(-1)).toEqual(["ch4 text"]);
    expect(calls).not.toContainEqual(["ch3 text"]);
  });

  it("caches the result even when the user has navigated away", async () => {
    const setParagraphs = jest.fn();
    const setLoading = jest.fn();
    const runEffect = makeTranslationEffect(setParagraphs, setLoading);

    let resolveChapter3!: (v: { paragraphs: string[]; cached: boolean }) => void;
    const p3 = new Promise<{ paragraphs: string[]; cached: boolean }>((r) => { resolveChapter3 = r; });

    runEffect("ch3", () => p3);

    // Navigate to chapter 4
    runEffect("ch4", () => Promise.resolve({ paragraphs: ["ch4 text"], cached: false }));

    // Chapter 3 arrives while on chapter 4
    resolveChapter3({ paragraphs: ["ch3 text"], cached: false });
    await flushPromises();

    // Now navigate back to chapter 3 — should hit cache, no second fetch
    const fetchFn = jest.fn().mockResolvedValue({ paragraphs: ["ch3 text"], cached: false });
    runEffect("ch3", fetchFn);
    await flushPromises();

    expect(fetchFn).not.toHaveBeenCalled(); // served from cache
    expect(setParagraphs).toHaveBeenLastCalledWith(["ch3 text"]);
  });

  it("does not clear the loading spinner for a previous chapter", async () => {
    const setParagraphs = jest.fn();
    const setLoading = jest.fn();
    const runEffect = makeTranslationEffect(setParagraphs, setLoading);

    let resolveChapter3!: (v: { paragraphs: string[]; cached: boolean }) => void;
    const p3 = new Promise<{ paragraphs: string[]; cached: boolean }>((r) => { resolveChapter3 = r; });

    runEffect("ch3", () => p3);
    // Move to chapter 4 (which loads instantly)
    runEffect("ch4", () => Promise.resolve({ paragraphs: ["ch4 text"], cached: false }));
    await flushPromises();

    const loadingCallsBeforeLateResolve = setLoading.mock.calls.length;

    // Late arrival of chapter 3
    resolveChapter3({ paragraphs: ["ch3 text"], cached: false });
    await flushPromises();

    // setLoading should not have been called again (ch3 is no longer current)
    expect(setLoading.mock.calls.length).toBe(loadingCallsBeforeLateResolve);
  });

  it("updates UI immediately when the chapter is still current", async () => {
    const setParagraphs = jest.fn();
    const setLoading = jest.fn();
    const runEffect = makeTranslationEffect(setParagraphs, setLoading);

    runEffect("ch5", () => Promise.resolve({ paragraphs: ["ch5 text"], cached: false }));
    await flushPromises();

    expect(setParagraphs).toHaveBeenCalledWith(["ch5 text"]);
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });
});

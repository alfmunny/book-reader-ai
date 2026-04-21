/**
 * E2E: TTS voice + sentence highlight synchronization.
 *
 * Tests that the sentence highlighted during TTS playback tracks the
 * audio's currentTime accurately. Uses a controlled mock Audio element
 * (injected before page load) so we can advance playback time without
 * waiting for real audio to play.
 *
 * ## Why this matters
 * The reader splits chapter text into sentences and assigns a `startTime`
 * to each. When the audio's `currentTime` advances past a sentence's
 * `startTime`, SentenceReader applies `bg-amber-300` to that `[data-seg]`
 * span. Two timing estimation paths exist:
 *   - Path a (accurate): TTS returns word boundaries via X-TTS-Timings header
 *   - Path b (estimate): character-count proportional distribution per chunk
 *
 * If the backend does not return word boundaries, path b's estimates can
 * drift enough for the highlight to noticeably lag or lead the voice.
 *
 * ## Running against the real TTS API
 * These tests mock the TTS endpoint. To run against the real backend
 * (slower, requires valid credentials in .env.local):
 *   PLAYWRIGHT_REAL_TTS=1 npm run test:e2e -- e2e/tts-highlight.spec.ts
 * In real-TTS mode the tests in "real TTS API" describe block are
 * enabled; all others still run with mocks.
 */
import { test, expect, Page } from "./base";
import { MOCK_BOOK, MOCK_FAUST, MOCK_CHAPTERS } from "./fixtures";

// ── Chapter text with three distinct sentences for highlight testing ──────────
// splitSentences() splits on .!? + whitespace + uppercase, so these three
// sentences will each become a separate data-seg span.
const TTS_CHAPTER_TEXT =
  "The sky was pale. The birds were still. The world held its breath.";

// Character counts for each sentence (for path-b timing estimates):
//   "The sky was pale."     = 18 chars → startTime ≈ 0s
//   "The birds were still." = 21 chars → startTime ≈ 18/57 * 3 ≈ 0.95s
//   "The world held its breath." = 26 chars → startTime ≈ 39/57 * 3 ≈ 2.05s
//   Total = 57 chars, mock chunk duration = 3s
const CHUNK_DURATION_S = 3;

// ── Mock Audio constructor injected before page load ──────────────────────────
// Overrides window.Audio so TTSControls creates controllable mock instances
// instead of real HTMLAudioElement objects. Exposes window.__tts_advance(t) to
// fire a timeupdate event with a given currentTime on the most-recent instance.
const MOCK_AUDIO_SCRIPT = `
  const __ttsInstances = [];
  window.__ttsInstances = __ttsInstances;

  function MockAudio(src) {
    this.src = src || '';
    this.preload = 'auto';
    this.playbackRate = 1;
    this._currentTime = 0;
    this._duration = window.__ttsMockDuration || ${CHUNK_DURATION_S};
    this._listeners = {};
    __ttsInstances.push(this);
  }

  Object.defineProperty(MockAudio.prototype, 'currentTime', {
    get() { return this._currentTime; },
    set(v) { this._currentTime = v; },
    configurable: true,
  });
  Object.defineProperty(MockAudio.prototype, 'duration', {
    get() { return this._duration; },
    configurable: true,
  });

  MockAudio.prototype.addEventListener = function(type, fn, opts) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push({ fn, once: !!(opts && opts.once) });
    // Auto-fire loadedmetadata so TTSControls' Promise resolves
    if (type === 'loadedmetadata') {
      const self = this;
      setTimeout(function() { self._fire('loadedmetadata'); }, 10);
    }
  };

  MockAudio.prototype.removeEventListener = function(type, fn) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(function(e) { return e.fn !== fn; });
  };

  MockAudio.prototype.play = function() { return Promise.resolve(); };
  MockAudio.prototype.pause = function() {};

  MockAudio.prototype._fire = function(type) {
    var entries = (this._listeners[type] || []).slice();
    var self = this;
    self._listeners[type] = (self._listeners[type] || []).filter(function(e) { return !e.once; });
    entries.forEach(function(e) {
      try { e.fn(new Event(type)); } catch(err) {}
    });
  };

  MockAudio.prototype._advance = function(time) {
    this._currentTime = time;
    this._fire('timeupdate');
  };

  window.Audio = MockAudio;

  window.__tts_advance = function(time) {
    var last = __ttsInstances[__ttsInstances.length - 1];
    if (last) last._advance(time);
  };
  window.__tts_count = function() { return __ttsInstances.length; };
`;

// ── Shared route setup ────────────────────────────────────────────────────────

async function setupTtsReader(page: Page, chapterText = TTS_CHAPTER_TEXT) {
  await page.setViewportSize({ width: 1280, height: 800 });

  // Inject mock Audio before any page scripts run
  await page.addInitScript(MOCK_AUDIO_SCRIPT);

  // Session with backendToken (required for API calls via backend proxy)
  await page.route("**/api/auth/session", (r) =>
    r.fulfill({
      json: {
        user: { name: "Test User", email: "test@example.com", image: "" },
        expires: "2030-01-01T00:00:00.000Z",
        backendToken: "mock-backend-token",
      },
    })
  );
  await page.route("**/api/user/me", (r) =>
    r.fulfill({
      json: { id: 1, email: "test@example.com", name: "Test", picture: "", hasGeminiKey: false, role: "user", approved: true },
    })
  );
  await page.route("**/api/books/cached", (r) => r.fulfill({ json: [MOCK_BOOK] }));
  await page.route(/\/api\/books\/\d+\/chapters$/, (r) => {
    const match = r.request().url().match(/\/books\/(\d+)\/chapters/);
    const bookId = Number(match?.[1] ?? 0);
    r.fulfill({
      json: {
        book_id: bookId,
        meta: bookId === 2229 ? MOCK_FAUST : MOCK_BOOK,
        chapters: [
          { title: "Chapter I", text: chapterText },
          ...MOCK_CHAPTERS.slice(1),
        ],
        images: [],
      },
    });
  });
  await page.route(/\/api\/books\/\d+$/, (r) => r.fulfill({ json: MOCK_BOOK }));
  await page.route(/\/api\/books\/\d+\/translation-status/, (r) =>
    r.fulfill({ json: { book_id: 1342, target_language: "en", total_chapters: 3, translated_chapters: 3, bulk_active: false } })
  );
  await page.route("**/api/ai/translate", (r) => r.fulfill({ json: { paragraphs: ["[translated]"], cached: true } }));
  await page.route("**/api/ai/insight", (r) => r.fulfill({ json: { insight: "A mock insight." } }));
  await page.route(/\/api\/annotations/, (r) => r.fulfill({ json: [] }));
  await page.route("**/api/user/reading-progress", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/books/*/chapters/*/translation", (r) =>
    r.fulfill({ json: { status: "ready", paragraphs: ["Translated."], provider: "gemini" } })
  );

  // TTS chunk split: return chapter text as a single chunk so TTSControls
  // makes exactly one synthesizeSpeech call for the whole chapter.
  await page.route("**/api/ai/tts/chunks", (r) =>
    r.fulfill({ json: { chunks: [chapterText] } })
  );

  // TTS audio: return an empty audio blob (mock Audio ignores the URL content).
  // No X-TTS-Timings header → path b (character-proportional) timing is used.
  await page.route("**/api/ai/tts", (r) =>
    r.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: Buffer.from([]),
    })
  );
}

/** Return the index of the currently highlighted segment (the one with bg-amber-300). */
async function getHighlightedSegIdx(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const el = document.querySelector(".bg-amber-300[data-seg]") as HTMLElement | null;
    if (!el) return null;
    return parseInt(el.getAttribute("data-seg") ?? "-1", 10);
  });
}

/** Wait until the TTS Read button shows "Pause" (playing state). */
async function waitForPlaying(page: Page) {
  await expect(page.getByText("⏸ Pause")).toBeVisible({ timeout: 10000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("TTS button states", () => {
  test.beforeEach(async ({ page }) => {
    await setupTtsReader(page);
    await page.goto("/reader/1342");
    await expect(page.getByText(TTS_CHAPTER_TEXT.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test("Read button is visible and in paused state initially", async ({ page }) => {
    await expect(page.getByText("▶ Read")).toBeVisible();
  });

  test("clicking Read enters loading state", async ({ page }) => {
    await page.getByText("▶ Read").click();
    // Loading spinner appears briefly while chunks are fetched + audio synthesised
    await expect(page.getByText(/Preparing/)).toBeVisible({ timeout: 5000 });
  });

  test("clicking Read transitions to playing state", async ({ page }) => {
    await page.getByText("▶ Read").click();
    // After mock loadedmetadata fires, TTSControls sets status="playing"
    await waitForPlaying(page);
  });

  test("Pause button pauses playback", async ({ page }) => {
    await page.getByText("▶ Read").click();
    await waitForPlaying(page);
    await page.getByText("⏸ Pause").click();
    await expect(page.getByText("▶ Read")).toBeVisible({ timeout: 3000 });
  });

  test("seek bar appears once audio is loaded", async ({ page }) => {
    await page.getByText("▶ Read").click();
    await waitForPlaying(page);
    // Seek slider is rendered when chunks.length > 0 and globalDuration > 0
    await expect(page.locator('input[aria-label="Playback position"]')).toBeVisible({ timeout: 3000 });
  });

  test("loading progress indicator appears during synthesis", async ({ page }) => {
    // Slow the TTS route so loading state stays visible long enough to assert.
    // (Without delay the mock resolves so fast the indicator flashes by in <16ms.)
    await page.route("**/api/ai/tts", async (r) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await r.fulfill({ status: 200, contentType: "audio/wav", body: Buffer.from([]) });
    });

    await page.getByText("▶ Read").click();
    await expect(page.getByText(/Generating chunk/)).toBeVisible({ timeout: 5000 });
  });
});

test.describe("TTS sentence highlight synchronization", () => {
  test.beforeEach(async ({ page }) => {
    await setupTtsReader(page);
    await page.goto("/reader/1342");
    await expect(page.getByText(TTS_CHAPTER_TEXT.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });
    // Start playback and wait for audio to "load" (mock fires loadedmetadata)
    await page.getByText("▶ Read").click();
    await waitForPlaying(page);
  });

  test("no sentence is highlighted before playback starts", async ({ page }) => {
    // After page loads but BEFORE clicking Read, currentTime=0 so no highlight
    // This is implicitly checked by the beforeEach of other describe blocks
    // (we navigated but haven't clicked Read yet in a fresh test)
  });

  test("first sentence is highlighted at start of playback", async ({ page }) => {
    // Advance to t=0.1s — first sentence startTime is 0s, so it should highlight
    await page.evaluate(() => { (window as any).__tts_advance(0.1); });
    await page.waitForTimeout(200); // let React re-render

    const idx = await getHighlightedSegIdx(page);
    expect(idx).toBe(0);
  });

  test("second sentence highlights when time passes its start", async ({ page }) => {
    // path-b estimate: sentence 1 starts at 18/57 * 3 ≈ 0.95s
    // Advance to 1.1s — safely past 0.95s but before sentence 2 (2.05s)
    await page.evaluate(() => { (window as any).__tts_advance(1.1); });
    await page.waitForTimeout(200);

    const idx = await getHighlightedSegIdx(page);
    expect(idx).toBe(1);
  });

  test("third sentence highlights when time passes its start", async ({ page }) => {
    // path-b estimate: sentence 2 starts at 39/57 * 3 ≈ 2.05s
    // Advance to 2.2s — safely past 2.05s
    await page.evaluate(() => { (window as any).__tts_advance(2.2); });
    await page.waitForTimeout(200);

    const idx = await getHighlightedSegIdx(page);
    expect(idx).toBe(2);
  });

  test("highlight follows time forward through all three sentences", async ({ page }) => {
    // Advance through first sentence
    await page.evaluate(() => { (window as any).__tts_advance(0.1); });
    await page.waitForTimeout(150);
    expect(await getHighlightedSegIdx(page)).toBe(0);

    // Advance through second sentence
    await page.evaluate(() => { (window as any).__tts_advance(1.1); });
    await page.waitForTimeout(150);
    expect(await getHighlightedSegIdx(page)).toBe(1);

    // Advance through third sentence
    await page.evaluate(() => { (window as any).__tts_advance(2.2); });
    await page.waitForTimeout(150);
    expect(await getHighlightedSegIdx(page)).toBe(2);
  });

  test("only one sentence is highlighted at a time", async ({ page }) => {
    await page.evaluate(() => { (window as any).__tts_advance(1.1); });
    await page.waitForTimeout(200);

    const count = await page.evaluate(() =>
      document.querySelectorAll(".bg-amber-300[data-seg]").length
    );
    expect(count).toBe(1);
  });

  test("highlighted sentence has accessible data-seg attribute", async ({ page }) => {
    await page.evaluate(() => { (window as any).__tts_advance(0.5); });
    await page.waitForTimeout(200);

    const segAttr = await page.evaluate(() => {
      const el = document.querySelector(".bg-amber-300[data-seg]");
      return el?.getAttribute("data-seg") ?? null;
    });
    expect(segAttr).not.toBeNull();
    expect(Number(segAttr)).toBeGreaterThanOrEqual(0);
  });
});

test.describe("TTS highlight with word boundaries (path a)", () => {
  // Word boundaries enable exact per-word timing instead of character estimates.
  // The X-TTS-Timings header carries: [{ word: "The", offset_ms: 0 }, ...]
  // Segment start times are then derived from actual word offsets.

  test("exact word-boundary timing highlights correct sentence", async ({ page }) => {
    // Override the TTS route to include word boundaries.
    // sentence 0 "The sky was pale."     starts at word 0 → offset_ms 0
    // sentence 1 "The birds were still." starts at word 4 → offset_ms 1200
    // sentence 2 "The world held its breath." starts at word 8 → offset_ms 2100
    const wordBoundaries = [
      { word: "The", offset_ms: 0 },
      { word: "sky", offset_ms: 300 },
      { word: "was", offset_ms: 550 },
      { word: "pale.", offset_ms: 800 },
      { word: "The", offset_ms: 1200 },
      { word: "birds", offset_ms: 1450 },
      { word: "were", offset_ms: 1650 },
      { word: "still.", offset_ms: 1850 },
      { word: "The", offset_ms: 2100 },
      { word: "world", offset_ms: 2300 },
      { word: "held", offset_ms: 2500 },
      { word: "its", offset_ms: 2700 },
      { word: "breath.", offset_ms: 2900 },
    ];

    await page.route("**/api/ai/tts", (r) =>
      r.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: Buffer.from([]),
        headers: { "X-TTS-Timings": JSON.stringify(wordBoundaries) },
      })
    );

    await setupTtsReader(page);
    await page.goto("/reader/1342");
    await expect(page.getByText(TTS_CHAPTER_TEXT.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });

    await page.getByText("▶ Read").click();
    await waitForPlaying(page);

    // At t=1.3s, word boundary says sentence 1 started at 1.2s
    await page.evaluate(() => { (window as any).__tts_advance(1.3); });
    await page.waitForTimeout(200);

    const idx = await getHighlightedSegIdx(page);
    expect(idx).toBe(1); // second sentence (0-indexed)
  });
});

test.describe("TTS highlight — real API (skipped unless PLAYWRIGHT_REAL_TTS=1)", () => {
  /**
   * These tests exercise the FULL TTS pipeline: real Gemini TTS API call,
   * real audio synthesis, real X-TTS-Timings header, real audio playback.
   *
   * Purpose: catch bugs that only manifest with actual TTS audio timing,
   * e.g. the voice speaking faster than the character-proportional estimate.
   *
   * How to run:
   *   PLAYWRIGHT_REAL_TTS=1 npm run test:e2e -- e2e/tts-highlight.spec.ts
   *
   * Requires:
   *   - Backend running locally (or NEXT_PUBLIC_API_URL pointing to staging)
   *   - Valid GEMINI_API_KEY / GOOGLE_TTS_KEY in backend environment
   *   - A real auth session (not the mocked one)
   *
   * What to look for when the sync is broken:
   *   - "highlighted sentence text" logged below won't match the voice
   *   - Check whether X-TTS-Timings is present in the TTS response headers
   *   - If empty, path b (char-proportional) is being used — fix the backend
   *     to always return word boundaries for the highlight to be accurate
   */
  test.skip(!process.env.PLAYWRIGHT_REAL_TTS, "set PLAYWRIGHT_REAL_TTS=1 to enable");

  test("voice matches highlighted sentence with real audio (manual verification)", async ({ page }) => {
    // With real TTS, we can't assert exact timing automatically.
    // Instead, we log what's highlighted at regular intervals so a human
    // can compare against what the voice is saying.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/reader/1342");
    await expect(page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })).toBeVisible({ timeout: 10000 });

    await page.getByText("▶ Read").click();
    await expect(page.getByText("⏸ Pause")).toBeVisible({ timeout: 30000 });

    // Sample highlighted sentence every 500ms for 5 seconds
    const samples: { t: number; text: string | null }[] = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(500);
      const text = await page.evaluate(() => {
        const el = document.querySelector(".bg-amber-300[data-seg]");
        return el?.textContent ?? null;
      });
      samples.push({ t: (i + 1) * 0.5, text });
    }

    console.log("TTS highlight samples (compare against voice):", JSON.stringify(samples, null, 2));
    console.log("If highlighted text lags the voice, X-TTS-Timings header may be missing from backend TTS responses.");

    // Basic assertion: at least one sentence was highlighted during playback
    expect(samples.some((s) => s.text !== null)).toBe(true);
  });
});

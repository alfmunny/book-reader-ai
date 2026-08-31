/**
 * Generated audio must survive a reload (owner, 2026-08-31): blob URLs die
 * with the page, so every refresh re-synthesised the whole chapter.
 */
import fs from "fs";
import path from "path";

const api = fs.readFileSync(path.join(__dirname, "../lib/api.ts"), "utf8");

describe("TTS audio cache", () => {
  it("checks a persistent cache before hitting the network", () => {
    expect(api).toContain('const TTS_CACHE = "tts-audio-v1";');
    const fn = api.slice(api.indexOf("export async function synthesizeSpeech"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body.indexOf("cache.match(key)")).toBeLessThan(body.indexOf("await fetch("));
  });

  it("keys on everything that changes the audio", () => {
    // A changed voice or rate must miss, not serve the previous voice.
    expect(api).toContain('JSON.stringify({ text, language, rate, gender })');
  });

  it("stores the word timings alongside the bytes", () => {
    // Without them the highlight falls back to character-proportional
    // estimates on every cache hit.
    expect(api).toContain('new Response(blob, { headers: timingsHeader ? { "X-TTS-Timings": timingsHeader } : {} })');
    expect(api).toContain('parseTimings(hit.headers.get("X-TTS-Timings"))');
  });

  it("degrades to plain fetching when storage is unavailable", () => {
    // Private mode, a full disk, or no Cache Storage must not break playback.
    expect(api).toContain('typeof caches !== "undefined"');
    expect(api).toContain("await caches.open(TTS_CACHE).catch(() => null)");
    expect(api).toMatch(/cache\.put\([\s\S]*?\)\.catch\(\(\) => \{\}\)/);
  });
});

const CACHE_PREFIX = "audio-start:";

function cacheKey(url: string) {
  return CACHE_PREFIX + url;
}

function cachedStart(url: string): number | null {
  try {
    const v = localStorage.getItem(cacheKey(url));
    if (v !== null) return Number(v);
  } catch {}
  return null;
}

function cacheStart(url: string, t: number) {
  try {
    localStorage.setItem(cacheKey(url), String(t));
  } catch {}
}

/**
 * Analyzes the beginning of an audio file to find where the actual content
 * starts (after a LibriVox-style license disclaimer).
 *
 * Strategy:
 *  - Fetch the first ~1.5 MB (enough for ~30–60 s of MP3)
 *  - Decode with Web Audio API
 *  - Compute RMS energy in 50 ms windows
 *  - After at least 8 s of speech (disclaimer), look for the first silence
 *    gap ≥ 0.35 s; the moment speech resumes after that gap is the start
 * Returns 0 if detection fails or no gap is found.
 */
export async function detectContentStart(url: string): Promise<number> {
  const cached = cachedStart(url);
  if (cached !== null) return cached;

  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return 0;

    // Fetch first 1.5 MB — covers ~30–60 s at typical LibriVox bitrates
    let arrayBuf: ArrayBuffer;
    try {
      const res = await fetch(url, {
        headers: { Range: "bytes=0-1500000" },
      });
      arrayBuf = await res.arrayBuffer();
    } catch {
      return 0;
    }

    const ctx = new AudioCtx();
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(arrayBuf);
    } catch {
      await ctx.close();
      return 0;
    }
    await ctx.close();

    const result = findSpeechResumeAfterGap(decoded);
    cacheStart(url, result);
    return result;
  } catch {
    return 0;
  }
}

function findSpeechResumeAfterGap(buf: AudioBuffer): number {
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const WIN_SEC = 0.05; // 50 ms windows
  const winSamples = Math.floor(sr * WIN_SEC);

  // Compute RMS energy per window
  const energies: number[] = [];
  for (let i = 0; i < data.length; i += winSamples) {
    let sum = 0;
    const end = Math.min(i + winSamples, data.length);
    for (let j = i; j < end; j++) sum += data[j] * data[j];
    energies.push(Math.sqrt(sum / (end - i)));
  }

  // Silence threshold: 15th-percentile energy × 5
  const sorted = [...energies].sort((a, b) => a - b);
  const silenceThresh = sorted[Math.floor(sorted.length * 0.15)] * 5;

  // Don't start looking until after 8 s (disclaimer is always longer)
  const minStartWin = Math.ceil(8 / WIN_SEC);
  // Stop searching at 60 s
  const maxWin = Math.min(energies.length, Math.ceil(60 / WIN_SEC));
  // Silence must last at least 0.35 s to count
  const minSilWin = Math.ceil(0.35 / WIN_SEC);

  let i = minStartWin;
  while (i < maxWin) {
    if (energies[i] < silenceThresh) {
      // Measure how long this silence lasts
      let j = i;
      while (j < maxWin && energies[j] < silenceThresh) j++;
      if (j - i >= minSilWin) {
        // Speech resumes at window j — that's our content start
        // Small negative buffer so we don't clip the first word
        return Math.max(0, j * WIN_SEC - 0.1);
      }
      i = j; // skip past short silence
    } else {
      i++;
    }
  }

  return 0; // no gap found — assume no disclaimer offset
}

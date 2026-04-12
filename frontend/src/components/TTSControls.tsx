"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { synthesizeSpeech, getTtsChunks, deleteAudioCache } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { getAudioPosition, saveAudioPosition, clearAudioPosition } from "@/lib/audio";

export interface ChunkSnapshot {
  text: string;
  duration: number;  // 0 until the chunk's audio loads
}

interface Props {
  text: string;
  language: string;
  bookId: number;
  chapterIndex: number;
  /**
   * Lift live playback state to the parent so SentenceReader can highlight
   * the currently-playing sentence. currentTime/duration are in *global*
   * time across all chunks, not per-chunk.
   */
  onPlaybackUpdate?: (currentTime: number, duration: number, isPlaying: boolean) => void;
  /** Notifies the parent whenever generation is in progress (true) or done. */
  onLoadingChange?: (isLoading: boolean) => void;
  /**
   * Notifies the parent of the current chunks list — text + duration per
   * chunk. Duration is 0 for chunks that haven't loaded yet. Used by
   * SentenceReader for accurate per-chunk timing and visual loaded/unloaded
   * coloring of segments.
   */
  onChunksUpdate?: (chunks: ChunkSnapshot[]) => void;
  /**
   * Register a seek-and-play function with the parent (SentenceReader uses
   * it to jump to the start time of a clicked sentence). The seek time is
   * in global chunk-aggregated seconds.
   */
  onSeekRegister?: (seekAndPlay: (time: number) => void) => void;
}

type Status =
  | "idle"     // no chapter loaded yet
  | "loading"  // fetching chunks (one per HTTP request, sequential)
  | "paused"   // chapter ready (audio loaded OR not yet fetched) → "▶ Read"
  | "playing"  // currently playing
  | "error";

interface ChunkState {
  index: number;
  text: string;       // for the "Preparing chunk N: <preview>" UI
  audio: HTMLAudioElement;
  blobUrl: string;
  duration: number;
}

interface LoadingState {
  index: number;
  total: number;
  preview: string;    // first ~60 chars of the chunk currently being fetched
}

/**
 * Chapter audio player with frontend-driven chunking.
 *
 * Flow:
 * 1. User clicks ▶ Read for the first time on this chapter.
 * 2. Frontend calls /api/ai/tts/chunks to ask the backend how it would slice
 *    the text. Returns e.g. ["chunk 0 text", "chunk 1 text", ...].
 * 3. Frontend fetches each chunk's audio sequentially via /api/ai/tts (with
 *    chunk_index in the body so the backend caches per-chunk).
 * 4. Chunk 0 starts playing as soon as it's loaded; chunks 1..N continue to
 *    fetch in the background. When the playing chunk ends, the next one
 *    starts immediately.
 * 5. While loading, the UI shows "Preparing N/M: <preview>".
 *
 * Playback model:
 * - Each chunk is its own <audio> element.
 * - Global currentTime = sum of completed-chunk durations + currentTime of
 *   the chunk currently playing.
 * - Global duration = sum of all known chunk durations (grows as chunks load).
 * - Seek bar values are in global seconds; seek translates to chunk + offset.
 * - Pause / resume just toggle play/pause on the active chunk's audio.
 * - Position is persisted as global seconds in localStorage per
 *   (bookId, chapterIndex), so it survives reloads.
 */
export default function TTSControls({
  text,
  language,
  bookId,
  chapterIndex,
  onPlaybackUpdate,
  onLoadingChange,
  onChunksUpdate,
  onSeekRegister,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [rate, setRate] = useState(1.0);
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingState, setLoadingState] = useState<LoadingState | null>(null);

  // Global playback state (aggregated across chunks)
  const [globalCurrentTime, setGlobalCurrentTime] = useState(0);
  const [globalDuration, setGlobalDuration] = useState(0);

  // Loaded chunks (in order). Mutated through state setters so React re-renders.
  const [chunks, setChunks] = useState<ChunkState[]>([]);
  const chunksRef = useRef<ChunkState[]>([]);
  // Index of the chunk currently playing or paused at
  const activeIndexRef = useRef<number>(0);

  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);

  // Full chunk list (text from getTtsChunks + duration that gets filled in
  // as each chunk loads). Distinct from `chunks` above which is only the
  // ChunkState[] for chunks whose audio is actually loaded.
  const [allChunks, setAllChunks] = useState<ChunkSnapshot[]>([]);

  // Latest callback refs — keep in refs so they don't trigger effect re-runs
  const onPlaybackUpdateRef = useRef(onPlaybackUpdate);
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onChunksUpdateRef = useRef(onChunksUpdate);
  const onSeekRegisterRef = useRef(onSeekRegister);
  useEffect(() => { onPlaybackUpdateRef.current = onPlaybackUpdate; }, [onPlaybackUpdate]);
  useEffect(() => { onLoadingChangeRef.current = onLoadingChange; }, [onLoadingChange]);
  useEffect(() => { onChunksUpdateRef.current = onChunksUpdate; }, [onChunksUpdate]);
  useEffect(() => { onSeekRegisterRef.current = onSeekRegister; }, [onSeekRegister]);

  // Notify parent whenever loading state or chunks change
  useEffect(() => {
    onLoadingChangeRef.current?.(status === "loading");
  }, [status]);
  useEffect(() => {
    onChunksUpdateRef.current?.(allChunks);
  }, [allChunks]);

  // ── Chapter change: full reset ─────────────────────────────────────────────
  useEffect(() => {
    cleanupAll();
    setGlobalCurrentTime(0);
    setGlobalDuration(0);
    setLoadingState(null);
    setErrorMsg("");
    setStatus(text ? "paused" : "idle");

    return () => {
      // Persist current playback position before tearing down
      const t = computeGlobalCurrentTime();
      if (t > 0 && t < globalDuration - 1) {
        saveAudioPosition(bookId, chapterIndex, t);
      }
      genRef.current++;
      abortRef.current?.abort();
      abortRef.current = null;
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, language, bookId, chapterIndex]);

  function cleanupAll() {
    for (const c of chunksRef.current) {
      c.audio.pause();
      c.audio.src = "";
      URL.revokeObjectURL(c.blobUrl);
    }
    chunksRef.current = [];
    setChunks([]);
    setAllChunks([]);
    activeIndexRef.current = 0;
    window.speechSynthesis.cancel();
  }

  // ── Global time helpers ────────────────────────────────────────────────────
  const computeGlobalCurrentTime = useCallback((): number => {
    let sum = 0;
    for (let i = 0; i < activeIndexRef.current; i++) {
      sum += chunksRef.current[i]?.duration ?? 0;
    }
    const active = chunksRef.current[activeIndexRef.current];
    if (active) sum += active.audio.currentTime;
    return sum;
  }, []);

  const computeGlobalDuration = useCallback((): number => {
    return chunksRef.current.reduce((sum, c) => sum + c.duration, 0);
  }, []);

  // Mirror state out to the parent on every change
  useEffect(() => {
    onPlaybackUpdateRef.current?.(
      globalCurrentTime,
      globalDuration,
      status === "playing"
    );
  }, [globalCurrentTime, globalDuration, status]);

  // ── Chunk loading ──────────────────────────────────────────────────────────
  /** Load + play. Optionally seek to a global time after the relevant chunk loads. */
  async function loadAndPlay(seekToGlobal?: number) {
    // If chunks already exist, just play (or seek then play)
    if (chunksRef.current.length > 0) {
      if (seekToGlobal !== undefined) {
        await seekTo(seekToGlobal);
      } else {
        const active = chunksRef.current[activeIndexRef.current];
        active?.audio.play().then(() => setStatus("playing")).catch(() => setStatus("error"));
      }
      return;
    }

    setStatus("loading");
    setErrorMsg("");
    const abort = new AbortController();
    abortRef.current = abort;
    const myGen = ++genRef.current;
    const settings = getSettings();
    const provider = settings.ttsProvider;

    try {
      // Step 1: ask the backend how to chunk this chapter
      const chunkTexts = await getTtsChunks(text);
      if (myGen !== genRef.current) return;
      if (chunkTexts.length === 0) {
        setStatus("error");
        setErrorMsg("No text to read.");
        return;
      }

      // Seed the full chunk list with duration=0; SentenceReader uses
      // this immediately to mute unloaded sentences in the text view.
      setAllChunks(chunkTexts.map((t) => ({ text: t, duration: 0 })));

      const savedPos = getAudioPosition(bookId, chapterIndex);
      let cumulative = 0;
      let started = false;

      // Step 2: fetch each chunk sequentially. Start playback after chunk 0
      // is loaded; subsequent chunks load in the background.
      for (let i = 0; i < chunkTexts.length; i++) {
        if (myGen !== genRef.current) return;

        const chunkText = chunkTexts[i];
        setLoadingState({
          index: i,
          total: chunkTexts.length,
          preview: chunkText.replace(/\s+/g, " ").trim().slice(0, 60),
        });

        // Retry up to 2 times on failure (network glitches, transient errors)
        let url: string;
        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            url = await synthesizeSpeech(chunkText, language, 1.0, provider, {
              bookId,
              chapterIndex,
              chunkIndex: i,
              signal: abort.signal,
            });
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e instanceof Error ? e : new Error("TTS failed");
            if (abort.signal.aborted) throw lastErr;
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
        if (lastErr) throw lastErr;

        if (myGen !== genRef.current) {
          URL.revokeObjectURL(url);
          return;
        }

        // Build the <audio> element and wait for its metadata
        const audio = new Audio(url);
        audio.preload = "auto";
        audio.playbackRate = rate;
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
          audio.addEventListener("error", () => reject(new Error(`chunk ${i} failed to load`)), { once: true });
        });

        if (myGen !== genRef.current) {
          URL.revokeObjectURL(url);
          return;
        }

        const duration = audio.duration || 0;
        const newChunk: ChunkState = {
          index: i,
          text: chunkText,
          audio,
          blobUrl: url,
          duration,
        };
        chunksRef.current = [...chunksRef.current, newChunk];
        setChunks([...chunksRef.current]);
        setGlobalDuration(computeGlobalDuration());
        // Update the public chunks snapshot — this is what SentenceReader
        // reads, and what triggers the "this segment is now loaded → switch
        // to full color" visual transition.
        setAllChunks((prev) => {
          const next = [...prev];
          next[i] = { text: chunkText, duration };
          return next;
        });

        // Hook up cross-chunk transition: when this chunk ends, advance.
        audio.addEventListener("ended", () => {
          if (myGen !== genRef.current) return;
          const next = i + 1;
          if (next < chunksRef.current.length) {
            activeIndexRef.current = next;
            const nextAudio = chunksRef.current[next].audio;
            nextAudio.playbackRate = rate;
            nextAudio.currentTime = 0;
            nextAudio.play().catch(() => {});
            setGlobalCurrentTime(computeGlobalCurrentTime());
          } else {
            // Last chunk finished — playback complete
            setStatus("paused");
            activeIndexRef.current = 0;
            // Reset all chunks to position 0
            for (const c of chunksRef.current) c.audio.currentTime = 0;
            setGlobalCurrentTime(0);
            clearAudioPosition(bookId, chapterIndex);
          }
        });
        audio.addEventListener("timeupdate", () => {
          if (myGen !== genRef.current) return;
          if (chunksRef.current[activeIndexRef.current]?.audio === audio) {
            setGlobalCurrentTime(computeGlobalCurrentTime());
          }
        });

        // Start playback as soon as the first chunk that contains the
        // resume position (or chunk 0 if no resume) is ready.
        if (!started) {
          let targetGlobal = 0;
          if (seekToGlobal !== undefined) {
            targetGlobal = seekToGlobal;
          } else if (savedPos > 0) {
            targetGlobal = savedPos;
          }

          // Does this chunk contain the target time?
          const chunkEnd = cumulative + duration;
          if (chunkEnd >= targetGlobal || i === chunkTexts.length - 1) {
            const offsetWithinChunk = Math.max(0, targetGlobal - cumulative);
            audio.currentTime = Math.min(offsetWithinChunk, duration);
            activeIndexRef.current = i;
            audio.play().catch(() => {});
            setStatus("playing");
            setGlobalCurrentTime(targetGlobal);
            started = true;
          }
        }

        cumulative += duration;
      }

      setLoadingState(null);
    } catch (e: unknown) {
      if (myGen !== genRef.current) return;
      if (e instanceof Error && e.name === "AbortError") {
        setStatus("paused");
        setLoadingState(null);
        return;
      }
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "TTS failed");
      setLoadingState(null);
    }
  }

  function play() {
    loadAndPlay();
  }

  function pause() {
    const active = chunksRef.current[activeIndexRef.current];
    if (!active) return;
    active.audio.pause();
    saveAudioPosition(bookId, chapterIndex, computeGlobalCurrentTime());
    setStatus("paused");
  }

  function cancelLoad() {
    abortRef.current?.abort();
    setStatus("paused");
    setLoadingState(null);
  }

  /** Seek to a global time (across all chunks). */
  async function seekTo(globalTime: number) {
    if (chunksRef.current.length === 0) {
      // Audio not loaded yet — kick off load with a target seek time
      await loadAndPlay(globalTime);
      return;
    }

    let cumulative = 0;
    for (let i = 0; i < chunksRef.current.length; i++) {
      const chunk = chunksRef.current[i];
      const chunkEnd = cumulative + chunk.duration;
      if (chunkEnd >= globalTime || i === chunksRef.current.length - 1) {
        // Pause the previously-active chunk
        const previousActive = chunksRef.current[activeIndexRef.current];
        if (previousActive && previousActive !== chunk) {
          previousActive.audio.pause();
        }
        const offset = Math.max(0, globalTime - cumulative);
        chunk.audio.currentTime = Math.min(offset, chunk.duration);
        activeIndexRef.current = i;
        chunk.audio.playbackRate = rate;
        try {
          await chunk.audio.play();
          setStatus("playing");
        } catch {
          // ignore — user-gesture rules etc.
        }
        setGlobalCurrentTime(globalTime);
        saveAudioPosition(bookId, chapterIndex, globalTime);
        return;
      }
      cumulative = chunkEnd;
    }
  }

  function changeRate(newRate: number) {
    setRate(newRate);
    for (const c of chunksRef.current) {
      c.audio.playbackRate = newRate;
    }
  }

  /**
   * Regenerate: clears the server-side cache for this chapter, tears down
   * any in-flight or loaded audio, then immediately re-triggers loadAndPlay
   * so the new generation starts right away.
   */
  async function regenerate() {
    abortRef.current?.abort();
    genRef.current++;
    cleanupAll();
    setGlobalCurrentTime(0);
    setGlobalDuration(0);
    setLoadingState(null);
    setErrorMsg("");
    clearAudioPosition(bookId, chapterIndex);
    try {
      await deleteAudioCache(bookId, chapterIndex);
    } catch (e: unknown) {
      // Non-fatal — we'll still try to regenerate even if the delete fails
      // (e.g. backend was already empty).
      console.warn("Failed to clear audio cache:", e);
    }
    // Kick off a fresh load
    loadAndPlay();
  }

  // Register seek function with parent so SentenceReader can drive playback
  useEffect(() => {
    onSeekRegisterRef.current?.((time: number) => {
      seekTo(time);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapterIndex]);

  // ── Render helpers ─────────────────────────────────────────────────────────
  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-white border-t border-amber-200">
      <div className="flex gap-1">
        {status === "loading" ? (
          <button
            onClick={cancelLoad}
            className="rounded-lg bg-amber-300 text-amber-900 px-4 py-1.5 text-sm flex items-center gap-2 hover:bg-amber-400"
            title="Click to cancel"
          >
            <span className="w-3 h-3 border-2 border-amber-700/40 border-t-amber-800 rounded-full animate-spin" />
            Preparing… ×
          </button>
        ) : status === "playing" ? (
          <button
            onClick={pause}
            className="rounded-lg bg-amber-200 text-amber-900 px-4 py-1.5 text-sm hover:bg-amber-300"
          >
            ⏸ Pause
          </button>
        ) : status === "paused" ? (
          <button
            onClick={play}
            className="rounded-lg bg-amber-700 text-white px-4 py-1.5 text-sm hover:bg-amber-800"
          >
            ▶ Read
          </button>
        ) : status === "error" ? (
          <button
            onClick={play}
            className="rounded-lg bg-red-100 text-red-800 border border-red-300 px-3 py-1.5 text-sm hover:bg-red-200"
            title={errorMsg || "Audio failed"}
          >
            ↻ Retry
          </button>
        ) : (
          <button
            disabled
            className="rounded-lg bg-amber-100 text-amber-400 px-4 py-1.5 text-sm cursor-not-allowed"
          >
            ▶ Read
          </button>
        )}
      </div>

      {/* Sound bar (visible whenever any chunk is loaded) */}
      {chunks.length > 0 && globalDuration > 0 && (
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="text-xs text-amber-700 tabular-nums w-10 text-right">
            {formatTime(globalCurrentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={globalDuration}
            step={0.1}
            value={globalCurrentTime}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="flex-1 accent-amber-700"
            aria-label="Playback position"
          />
          <span className="text-xs text-amber-700 tabular-nums w-10">
            {formatTime(globalDuration)}
          </span>
        </div>
      )}

      <label className="flex items-center gap-1 text-xs text-amber-800">
        Speed
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={rate}
          onChange={(e) => changeRate(Number(e.target.value))}
          className="w-20 accent-amber-700"
        />
        <span>{rate.toFixed(1)}×</span>
      </label>

      {/* Regenerate button — only when there's something to regenerate */}
      {(allChunks.length > 0 || status === "error") && status !== "loading" && (
        <button
          onClick={regenerate}
          title="Clear cached audio and re-generate this chapter from scratch"
          className="text-amber-600 hover:text-amber-900 text-base px-2 py-1 rounded hover:bg-amber-50 transition-colors"
          aria-label="Regenerate audio"
        >
          ↻
        </button>
      )}

      {/* Loud per-chunk progress bar while loading */}
      {loadingState && (
        <div className="w-full mt-1">
          <div className="flex items-center justify-between text-xs text-amber-800 mb-1">
            <span className="font-medium">
              Generating chunk {loadingState.index + 1} of {loadingState.total}
            </span>
            <span className="text-amber-600">
              {Math.round(((loadingState.index) / loadingState.total) * 100)}%
            </span>
          </div>
          <div className="h-2 w-full bg-amber-100 rounded-full overflow-hidden relative">
            {/* Filled portion = chunks already done */}
            <div
              className="absolute inset-y-0 left-0 bg-amber-600 transition-all duration-300"
              style={{ width: `${(loadingState.index / loadingState.total) * 100}%` }}
            />
            {/* Currently-generating chunk: animated indeterminate stripe over the next slot */}
            <div
              className="absolute inset-y-0 bg-amber-400/60 animate-pulse"
              style={{
                left: `${(loadingState.index / loadingState.total) * 100}%`,
                width: `${(1 / loadingState.total) * 100}%`,
              }}
            />
          </div>
          <p className="text-xs text-stone-500 mt-1 italic truncate">
            &ldquo;{loadingState.preview}…&rdquo;
          </p>
        </div>
      )}

      {status === "error" && errorMsg && (
        <p className="text-xs text-red-600 w-full">{errorMsg}</p>
      )}
    </div>
  );
}

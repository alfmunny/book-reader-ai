"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { synthesizeSpeech, getTtsChunks, WordBoundary } from "@/lib/api";
import { getSettings, saveSettings } from "@/lib/settings";
import { getAudioPosition, saveAudioPosition, clearAudioPosition } from "@/lib/audio";
import { PlayIcon, PauseIcon, RetryIcon, CloseIcon } from "@/components/Icons";

export interface ChunkSnapshot {
  text: string;
  duration: number;  // 0 until the chunk's audio loads
  wordBoundaries?: WordBoundary[];
}

interface Props {
  text: string;
  language: string;
  bookId: number;
  chapterIndex: number;
  onPlaybackUpdate?: (currentTime: number, duration: number, isPlaying: boolean) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  onChunksUpdate?: (chunks: ChunkSnapshot[]) => void;
  onSeekRegister?: (seekAndPlay: (time: number) => void) => void;
  onControlsRegister?: (controls: { pause: () => void; play: () => void }) => void;
  /** Auto-pause when globalCurrentTime reaches this value. */
  stopAtTime?: number;
  /** Called when stopAtTime is reached and audio is auto-paused. */
  onStopAtReached?: () => void;
}

type Status = "idle" | "loading" | "paused" | "playing" | "error";

interface ChunkState {
  index: number;
  text: string;
  audio: HTMLAudioElement;
  blobUrl: string;
  duration: number;
}

interface LoadingState {
  index: number;
  total: number;
  preview: string;
}

export default function TTSControls({
  text,
  language,
  bookId,
  chapterIndex,
  onPlaybackUpdate,
  onLoadingChange,
  onChunksUpdate,
  onSeekRegister,
  onControlsRegister,
  stopAtTime,
  onStopAtReached,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [rate, setRate] = useState(1.0);
  const [gender, setGender] = useState<"female" | "male">(() => getSettings().ttsGender);
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingState, setLoadingState] = useState<LoadingState | null>(null);

  const [globalCurrentTime, setGlobalCurrentTime] = useState(0);
  const [globalDuration, setGlobalDuration] = useState(0);

  const [chunks, setChunks] = useState<ChunkState[]>([]);
  const chunksRef = useRef<ChunkState[]>([]);
  const activeIndexRef = useRef<number>(0);

  const statusRef = useRef<Status>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);

  const [allChunks, setAllChunks] = useState<ChunkSnapshot[]>([]);

  const onPlaybackUpdateRef = useRef(onPlaybackUpdate);
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onChunksUpdateRef = useRef(onChunksUpdate);
  const onSeekRegisterRef = useRef(onSeekRegister);
  const onControlsRegisterRef = useRef(onControlsRegister);
  const onStopAtReachedRef = useRef(onStopAtReached);
  const stopAtTimeRef = useRef(stopAtTime);
  useEffect(() => { onPlaybackUpdateRef.current = onPlaybackUpdate; }, [onPlaybackUpdate]);
  useEffect(() => { onLoadingChangeRef.current = onLoadingChange; }, [onLoadingChange]);
  useEffect(() => { onChunksUpdateRef.current = onChunksUpdate; }, [onChunksUpdate]);
  useEffect(() => { onSeekRegisterRef.current = onSeekRegister; }, [onSeekRegister]);
  useEffect(() => { onControlsRegisterRef.current = onControlsRegister; }, [onControlsRegister]);
  useEffect(() => { onStopAtReachedRef.current = onStopAtReached; }, [onStopAtReached]);
  useEffect(() => { stopAtTimeRef.current = stopAtTime; }, [stopAtTime]);

  useEffect(() => {
    statusRef.current = status;
    onLoadingChangeRef.current?.(status === "loading");
  }, [status]);
  useEffect(() => {
    onChunksUpdateRef.current?.(allChunks);
  }, [allChunks]);

  // Chapter change: full reset
  useEffect(() => {
    cleanupAll();
    setGlobalCurrentTime(0);
    setGlobalDuration(0);
    setLoadingState(null);
    setErrorMsg("");
    setStatus(text ? "paused" : "idle");

    return () => {
      const t = computeGlobalCurrentTime();
      const dur = computeGlobalDuration();
      if (t > 0 && t < dur - 1) {
        saveAudioPosition(bookId, chapterIndex, t);
      }
      genRef.current++;
      abortRef.current?.abort();
      abortRef.current = null;
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, language, bookId, chapterIndex]);

  // Gender change: restart from scratch when gender changes mid-session
  useEffect(() => {
    if (status === "idle") return;
    abortRef.current?.abort();
    genRef.current++;
    cleanupAll();
    setGlobalCurrentTime(0);
    setGlobalDuration(0);
    setLoadingState(null);
    setErrorMsg("");
    setStatus(text ? "paused" : "idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender]);

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

  useEffect(() => {
    onPlaybackUpdateRef.current?.(globalCurrentTime, globalDuration, status === "playing");
  }, [globalCurrentTime, globalDuration, status]);

  async function loadAndPlay(seekToGlobal?: number) {
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
    const currentGender = gender;

    try {
      const chunkTexts = await getTtsChunks(text);
      if (myGen !== genRef.current) return;
      if (chunkTexts.length === 0) {
        setStatus("error");
        setErrorMsg("No text to read.");
        return;
      }

      setAllChunks(chunkTexts.map((t) => ({ text: t, duration: 0, wordBoundaries: [] })));

      const savedPos = getAudioPosition(bookId, chapterIndex);
      let cumulative = 0;
      let started = false;

      for (let i = 0; i < chunkTexts.length; i++) {
        if (myGen !== genRef.current) return;

        const chunkText = chunkTexts[i];
        setLoadingState({
          index: i,
          total: chunkTexts.length,
          preview: chunkText.replace(/\s+/g, " ").trim().slice(0, 60),
        });

        let url = "";
        let wordBoundaries: WordBoundary[] = [];
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            ({ url, wordBoundaries } = await synthesizeSpeech(chunkText, language, 1.0, currentGender, abort.signal));
            break;
          } catch (e) {
            if (abort.signal.aborted || attempt === 2) throw e;
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        }

        if (myGen !== genRef.current) {
          URL.revokeObjectURL(url);
          return;
        }

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
        const newChunk: ChunkState = { index: i, text: chunkText, audio, blobUrl: url, duration };
        chunksRef.current = [...chunksRef.current, newChunk];
        setChunks([...chunksRef.current]);
        setGlobalDuration(computeGlobalDuration());
        setAllChunks((prev) => {
          const next = [...prev];
          next[i] = { text: chunkText, duration, wordBoundaries };
          return next;
        });

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
            setStatus("paused");
            activeIndexRef.current = 0;
            for (const c of chunksRef.current) c.audio.currentTime = 0;
            setGlobalCurrentTime(0);
            clearAudioPosition(bookId, chapterIndex);
          }
        });
        audio.addEventListener("timeupdate", () => {
          if (myGen !== genRef.current) return;
          if (audio.paused) return; // skip seek-triggered updates on paused audio
          if (chunksRef.current[activeIndexRef.current]?.audio === audio) {
            const t = computeGlobalCurrentTime();
            setGlobalCurrentTime(t);
            const stopAt = stopAtTimeRef.current;
            if (stopAt !== undefined && Number.isFinite(stopAt) && t >= stopAt) {
              audio.pause();
              setStatus("paused");
              saveAudioPosition(bookId, chapterIndex, t);
              onStopAtReachedRef.current?.();
            }
          }
        });

        if (!started) {
          let targetGlobal = 0;
          if (seekToGlobal !== undefined) {
            targetGlobal = seekToGlobal;
          } else if (savedPos > 0) {
            targetGlobal = savedPos;
          }

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

  function play() { loadAndPlay(); }

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

  async function seekTo(globalTime: number) {
    if (chunksRef.current.length === 0) {
      // Only start loading+playing if audio was already playing
      if (statusRef.current === "playing") {
        await loadAndPlay(globalTime);
      }
      return;
    }

    const wasPlaying = statusRef.current === "playing";
    let cumulative = 0;
    for (let i = 0; i < chunksRef.current.length; i++) {
      const chunk = chunksRef.current[i];
      const chunkEnd = cumulative + chunk.duration;
      if (chunkEnd >= globalTime || i === chunksRef.current.length - 1) {
        const previousActive = chunksRef.current[activeIndexRef.current];
        if (previousActive && previousActive !== chunk) {
          previousActive.audio.pause();
        }
        const offset = Math.max(0, globalTime - cumulative);
        chunk.audio.currentTime = Math.min(offset, chunk.duration);
        activeIndexRef.current = i;
        chunk.audio.playbackRate = rate;
        if (wasPlaying) {
          try {
            await chunk.audio.play();
            setStatus("playing");
          } catch {
            // ignore — user-gesture rules etc.
          }
        } else {
          setStatus("paused");
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

  function toggleGender() {
    const next = gender === "female" ? "male" : "female";
    setGender(next);
    saveSettings({ ttsGender: next });
  }

  useEffect(() => {
    onSeekRegisterRef.current?.((time: number) => { seekTo(time); });
    onControlsRegisterRef.current?.({ pause, play });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapterIndex]);

  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 md:gap-3 p-2 md:p-3 bg-white border-t border-amber-200">
      <div className="flex gap-1">
        {status === "loading" ? (
          <button
            onClick={cancelLoad}
            className="rounded-lg bg-amber-300 text-amber-900 px-4 py-2.5 md:py-1.5 text-sm flex items-center gap-2 hover:bg-amber-400 min-h-[44px] md:min-h-0"
            title="Click to cancel"
          >
            <span className="w-3 h-3 border-2 border-amber-700/40 border-t-amber-800 rounded-full animate-spin" />
            Preparing…
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        ) : status === "playing" ? (
          <button
            data-tts-play
            onClick={pause}
            className="rounded-lg bg-amber-200 text-amber-900 px-4 py-2.5 md:py-1.5 text-sm hover:bg-amber-300 min-h-[44px] md:min-h-0 flex items-center gap-1.5"
          >
            <PauseIcon className="w-3.5 h-3.5" />
            Pause
          </button>
        ) : status === "paused" ? (
          <button
            data-tts-play
            onClick={play}
            className="rounded-lg bg-amber-700 text-white px-4 py-2.5 md:py-1.5 text-sm hover:bg-amber-800 min-h-[44px] md:min-h-0 flex items-center gap-1.5"
          >
            <PlayIcon className="w-3.5 h-3.5" />
            Read
          </button>
        ) : status === "error" ? (
          <button
            onClick={play}
            className="rounded-lg bg-red-100 text-red-800 border border-red-300 px-3 py-2.5 md:py-1.5 text-sm hover:bg-red-200 min-h-[44px] md:min-h-0 flex items-center gap-1.5"
            title={errorMsg || "Audio failed"}
          >
            <RetryIcon className="w-3.5 h-3.5" />
            Retry
          </button>
        ) : (
          <button
            disabled
            className="rounded-lg bg-amber-100 text-amber-400 px-4 py-2.5 md:py-1.5 text-sm cursor-not-allowed min-h-[44px] md:min-h-0 flex items-center gap-1.5"
          >
            <PlayIcon className="w-3.5 h-3.5" />
            Read
          </button>
        )}
      </div>

      {/* Gender toggle */}
      <button
        onClick={toggleGender}
        title={`Voice: ${gender}. Click to switch.`}
        aria-label={`Voice: ${gender === "female" ? "Female" : "Male"}. Click to switch.`}
        className="text-xs px-3 py-2 md:px-2 md:py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors min-h-[44px] md:min-h-0 font-medium"
        disabled={status === "loading"}
      >
        {gender === "female" ? "F" : "M"}
      </button>

      {/* Seek bar */}
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
          className="w-24 md:w-20 accent-amber-700"
        />
        <span>{rate.toFixed(1)}×</span>
      </label>

      {/* Per-chunk progress bar while loading */}
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
            <div
              className="absolute inset-y-0 left-0 bg-amber-600 transition-all duration-300"
              style={{ width: `${(loadingState.index / loadingState.total) * 100}%` }}
            />
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
        <p role="alert" className="text-xs text-red-600 w-full">{errorMsg}</p>
      )}
    </div>
  );
}

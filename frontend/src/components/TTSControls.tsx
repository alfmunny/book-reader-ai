"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  text: string;
  language: string;
  onWordIndex?: (index: number) => void;
}

export default function TTSControls({ text, language, onWordIndex }: Props) {
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const uttRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    function loadVoices() {
      const v = speechSynthesis.getVoices().filter(
        (v) => v.lang.startsWith(language === "de" ? "de" : language === "fr" ? "fr" : "en")
      );
      setVoices(v);
      if (v.length > 0) setSelectedVoice(v[0].name);
    }
    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [language]);

  useEffect(() => {
    return () => { speechSynthesis.cancel(); };
  }, []);

  function play() {
    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = rate;
    utt.pitch = pitch;
    utt.lang = language === "de" ? "de-DE" : language === "fr" ? "fr-FR" : "en-US";
    const voice = voices.find((v) => v.name === selectedVoice);
    if (voice) utt.voice = voice;
    utt.onend = () => setPlaying(false);
    utt.onerror = () => setPlaying(false);
    uttRef.current = utt;
    speechSynthesis.speak(utt);
    setPlaying(true);
  }

  function pause() {
    speechSynthesis.pause();
    setPlaying(false);
  }

  function resume() {
    speechSynthesis.resume();
    setPlaying(true);
  }

  function stop() {
    speechSynthesis.cancel();
    setPlaying(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-white border-t border-amber-200">
      <div className="flex gap-1">
        {!playing ? (
          <button
            onClick={typeof speechSynthesis !== "undefined" && speechSynthesis.paused ? resume : play}
            className="rounded-lg bg-amber-700 text-white px-4 py-1.5 text-sm hover:bg-amber-800"
          >
            {typeof speechSynthesis !== "undefined" && speechSynthesis.paused ? "▶ Resume" : "▶ Read"}
          </button>
        ) : (
          <button
            onClick={pause}
            className="rounded-lg bg-amber-200 text-amber-900 px-4 py-1.5 text-sm hover:bg-amber-300"
          >
            ⏸ Pause
          </button>
        )}
        <button
          onClick={stop}
          className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100"
        >
          ⏹
        </button>
      </div>

      <label className="flex items-center gap-1 text-xs text-amber-800">
        Speed
        <input
          type="range" min="0.5" max="2" step="0.1"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="w-20 accent-amber-700"
        />
        <span>{rate.toFixed(1)}×</span>
      </label>

      <label className="flex items-center gap-1 text-xs text-amber-800">
        Pitch
        <input
          type="range" min="0.5" max="2" step="0.1"
          value={pitch}
          onChange={(e) => setPitch(Number(e.target.value))}
          className="w-20 accent-amber-700"
        />
        <span>{pitch.toFixed(1)}</span>
      </label>

      {voices.length > 0 && (
        <select
          className="text-xs rounded border border-amber-300 px-2 py-1 text-ink"
          value={selectedVoice}
          onChange={(e) => setSelectedVoice(e.target.value)}
        >
          {voices.map((v) => (
            <option key={v.name} value={v.name}>{v.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

"use client";
import { useRef, useState } from "react";

interface Props {
  onResult: (transcript: string) => void;
  language: string;
}

export default function PronunciationRecorder({ onResult, language }: Props) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  function start() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang =
      language === "de" ? "de-DE" : language === "fr" ? "fr-FR" : "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript + " ";
      }
      if (final) {
        setTranscript(final.trim());
        onResult(final.trim());
      }
    };
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => setRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
    setTranscript("");
  }

  function stop() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <button
          onClick={recording ? stop : start}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
            recording
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-amber-700 text-white hover:bg-amber-800"
          }`}
        >
          {recording ? "⏹ Stop Recording" : "🎙 Record Reading"}
        </button>
        {recording && (
          <span className="text-xs text-red-500 animate-pulse">Recording...</span>
        )}
      </div>
      {transcript && (
        <div className="rounded bg-gray-50 border border-gray-200 p-2 text-xs text-gray-700">
          <span className="font-medium">Transcribed: </span>{transcript}
        </div>
      )}
    </div>
  );
}

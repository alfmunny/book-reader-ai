const DEFAULT_BACKEND_URL = "https://book-reader-ai-backend.vercel.app/api";

// ── Helper: load settings ─────────────────────────────────────────────────────
function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      { backendUrl: DEFAULT_BACKEND_URL, gender: "female", rate: 1.0, language: "en" },
      resolve
    );
  });
}

// ── Helper: build absolute API URL ───────────────────────────────────────────
function apiUrl(baseUrl, path) {
  return baseUrl.replace(/\/+$/, "") + path;
}

// ── Message router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((err) => {
    sendResponse({ error: err?.message || String(err) });
  });
  // Return true to indicate async response
  return true;
});

async function handleMessage(message) {
  const settings = await getSettings();
  const base = settings.backendUrl || DEFAULT_BACKEND_URL;

  switch (message.type) {
    case "TTS_CHUNKS": {
      // POST /ai/tts/chunks — returns { chunks: string[] }
      const res = await fetch(apiUrl(base, "/ai/tts/chunks"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.text }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`TTS chunks error ${res.status}: ${detail}`);
      }
      const data = await res.json();
      return { chunks: data.chunks };
    }

    case "TTS_SYNTHESIZE": {
      // POST /ai/tts — returns audio/mpeg binary
      const gender = message.gender || settings.gender || "female";
      const rate = message.rate ?? settings.rate ?? 1.0;
      const language = message.language || settings.language || "en";

      const res = await fetch(apiUrl(base, "/ai/tts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message.text,
          language,
          rate,
          gender,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`TTS error ${res.status}: ${detail}`);
      }

      // Convert the audio blob to a base64 data URL so it can be sent
      // through the message channel (Blobs are not transferable between
      // service worker and content script via sendMessage).
      const arrayBuffer = await res.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64 = btoa(binary);
      return { audioDataUrl: `data:audio/mpeg;base64,${base64}` };
    }

    case "TRANSLATE": {
      // POST /ai/translate
      // The backend TranslateRequest: { text, source_language, target_language, provider }
      const targetLang = message.targetLang || "zh";
      const sourceLang = message.sourceLang || "en";

      const res = await fetch(apiUrl(base, "/ai/translate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message.text,
          source_language: sourceLang,
          target_language: targetLang,
          provider: "google", // free, no auth required for the extension
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Translate error ${res.status}: ${detail}`);
      }
      const data = await res.json();
      // API returns { paragraphs: string[], cached: bool, provider: string }
      const paragraphs = data.paragraphs || [];
      return { translation: paragraphs.join("\n\n") };
    }

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

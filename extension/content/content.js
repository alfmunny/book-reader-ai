/* Book Reader AI — content script (Project Gutenberg) */

// ── Guard: run only once ───────────────────────────────────────────────────────
if (window.__braiInjected) {
  // Already injected; bail out.
  throw new Error("BRAI already injected");
}
window.__braiInjected = true;

// ── Sentence splitting (ported from SentenceReader.tsx) ──────────────────────
const ABBREV = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|Rev|Gen|Sgt|Cpl|Pvt|Capt|Lt|Col|Gov|Pres|St|Mt|vs|etc|no|vol|pp|ed|trans|approx|dept|corp|ltd|inc|co)\b|(?:\b[A-Z]\.)+)\.?\s*$/i;

function splitSentences(text) {
  // Split at: .!? (optionally followed by closing quote/bracket) + whitespace + uppercase
  const parts = text.split(/(?<=[.!?]['""\u2019\u201D]?)\s+(?=[A-Z\u00C0-\u00DC\u0400-\u042F])/);

  const result = [];
  let pending = "";

  for (const part of parts) {
    if (!pending) {
      pending = part;
      continue;
    }
    if (ABBREV.test(pending)) {
      pending = pending + " " + part;
    } else {
      result.push(pending);
      pending = part;
    }
  }
  if (pending) result.push(pending);

  return result.map((s) => s.trim()).filter(Boolean);
}

// ── Book-page detection ────────────────────────────────────────────────────────
function isBookPage() {
  return !!(
    document.querySelector("#pg-machine-header") ||
    document.querySelector(".chapter") ||
    document.querySelector("#pg-end-separator") ||
    document.querySelector("[class*='chapter']") ||
    document.querySelector(".txt_reading_area")
  );
}

// ── Text extraction ────────────────────────────────────────────────────────────
function getBookContainer() {
  // Try the most common Gutenberg HTML book containers, in preference order
  return (
    document.querySelector(".chapter") ||
    document.querySelector("#pg-end-separator")?.parentElement ||
    document.querySelector("body > div.text") ||
    document.querySelector("[class*='chapter']") ||
    document.querySelector(".txt_reading_area") ||
    document.querySelector("body")
  );
}

function extractPlainText(container) {
  // Walk text nodes; skip script/style/the sidebar itself
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const el = node.parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;
        if (el.closest("#brai-sidebar")) return NodeFilter.FILTER_REJECT;
        const tag = el.tagName.toLowerCase();
        if (tag === "script" || tag === "style" || tag === "noscript") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const chunks = [];
  let node;
  while ((node = walker.nextNode())) {
    const t = node.textContent.trim();
    if (t) chunks.push(t);
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

// ── Highlight management ──────────────────────────────────────────────────────
let highlightMarks = [];   // Array of { mark, text } to allow active state toggle
let activeMarkIndex = -1;

function clearHighlights() {
  for (const { mark } of highlightMarks) {
    // Unwrap: replace mark with its text node
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
  }
  highlightMarks = [];
  activeMarkIndex = -1;
}

function buildHighlights(sentences, container) {
  clearHighlights();
  if (!sentences.length) return;

  // We'll do a single-pass replacement over the container's inner HTML text.
  // Strategy: collect all text nodes, then find each sentence in order.
  const textNodes = [];
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const el = node.parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;
        if (el.closest("#brai-sidebar")) return NodeFilter.FILTER_REJECT;
        if (el.closest("script, style, noscript")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  // Build a flat string + offset map to locate sentences
  const segments = [];
  let total = 0;
  for (const tn of textNodes) {
    segments.push({ node: tn, start: total, length: tn.textContent.length });
    total += tn.textContent.length + 1; // +1 for separator
  }
  const flat = segments.map((s) => s.node.textContent).join(" ");

  for (const sentence of sentences) {
    const needle = sentence.replace(/\s+/g, " ").trim();
    if (!needle) continue;

    const idx = flat.indexOf(needle);
    if (idx === -1) continue; // sentence not found verbatim — skip

    // Find which text node(s) contain this range
    const rangeStart = idx;
    const rangeEnd = idx + needle.length;

    // Find the single text node that contains the full sentence (common case)
    const seg = segments.find(
      (s) => s.start <= rangeStart && s.start + s.length >= rangeEnd
    );
    if (!seg) continue;

    const localStart = rangeStart - seg.start;
    const localEnd = rangeEnd - seg.start;
    const tn = seg.node;
    const text = tn.textContent;

    // Split the text node into [before, match, after] and wrap match in <mark>
    try {
      const before = text.slice(0, localStart);
      const match = text.slice(localStart, localEnd);
      const after = text.slice(localEnd);

      const mark = document.createElement("mark");
      mark.className = "brai-highlight";
      mark.textContent = match;

      const parent = tn.parentNode;
      if (!parent) continue;

      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      frag.appendChild(mark);
      if (after) frag.appendChild(document.createTextNode(after));

      parent.replaceChild(frag, tn);

      // Update the segment's node reference to the "after" text node so
      // subsequent sentences in the same original node still work
      if (after) {
        const newAfterNode = mark.nextSibling;
        seg.node = newAfterNode;
        seg.start = rangeEnd;
        seg.length = after.length;
      }

      highlightMarks.push({ mark, text: sentence });
    } catch (_e) {
      // DOM mutation error; skip this sentence
    }
  }
}

function setActiveHighlight(index) {
  if (activeMarkIndex >= 0 && activeMarkIndex < highlightMarks.length) {
    highlightMarks[activeMarkIndex].mark.classList.remove("brai-highlight-active");
  }
  activeMarkIndex = index;
  if (index >= 0 && index < highlightMarks.length) {
    const mark = highlightMarks[index].mark;
    mark.classList.add("brai-highlight-active");
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// ── Playback state ─────────────────────────────────────────────────────────────
const state = {
  playing: false,
  stopped: true,
  sentences: [],
  currentIndex: 0,
  settings: {
    gender: "female",
    rate: 1.0,
    language: "en",
  },
};

let currentAudio = null;

function stopPlayback() {
  state.playing = false;
  state.stopped = true;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  setActiveHighlight(-1);
  updateUI();
}

async function playSentences(startIndex = 0) {
  state.stopped = false;
  state.playing = true;
  state.currentIndex = startIndex;
  updateUI();

  const container = getBookContainer();

  while (state.currentIndex < state.sentences.length && !state.stopped) {
    const sentence = state.sentences[state.currentIndex];
    const idx = state.currentIndex;

    // Update UI with current sentence
    setSentenceDisplay(sentence);
    setActiveHighlight(idx);
    updateProgress(idx, state.sentences.length);

    // Synthesize and play
    try {
      await synthesizeAndPlay(sentence);
    } catch (err) {
      setStatus("TTS error: " + (err.message || String(err)), true);
      // Continue to next sentence rather than halting
    }

    if (!state.stopped) {
      state.currentIndex++;
    }
  }

  if (!state.stopped) {
    // Finished all sentences naturally
    state.playing = false;
    state.stopped = true;
    setActiveHighlight(-1);
    setSentenceDisplay("", true);
    updateProgress(0, 1);
    setStatus("Playback complete");
    updateUI();
  }
}

function synthesizeAndPlay(text) {
  return new Promise((resolve, reject) => {
    if (state.stopped) {
      resolve();
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "TTS_SYNTHESIZE",
        text,
        language: state.settings.language,
        rate: state.settings.rate,
        gender: state.settings.gender,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.error) {
          reject(new Error(response.error));
          return;
        }
        if (!response?.audioDataUrl) {
          reject(new Error("No audio data received"));
          return;
        }

        if (state.stopped) {
          resolve();
          return;
        }

        const audio = new Audio(response.audioDataUrl);
        currentAudio = audio;

        audio.playbackRate = 1.0; // rate already applied server-side
        audio.onended = () => {
          currentAudio = null;
          resolve();
        };
        audio.onerror = (e) => {
          currentAudio = null;
          reject(new Error("Audio playback error"));
        };
        audio.play().catch(reject);
      }
    );
  });
}

// ── Sidebar UI ─────────────────────────────────────────────────────────────────
function buildSidebar() {
  const sidebar = document.createElement("div");
  sidebar.id = "brai-sidebar";
  sidebar.innerHTML = `
    <div id="brai-header">
      <span id="brai-title">Book Reader AI</span>
      <button id="brai-toggle-collapse" title="Collapse/Expand">◀</button>
    </div>
    <div id="brai-body">
      <div id="brai-controls">
        <button class="brai-btn" id="brai-play-btn">▶ Play</button>
        <button class="brai-btn" id="brai-stop-btn">■ Stop</button>
      </div>
      <div id="brai-progress">
        <div id="brai-progress-bar"></div>
      </div>
      <div id="brai-sentence-box" class="brai-empty">Press Play to start reading aloud.</div>
      <div id="brai-translate-section">
        <button class="brai-btn" id="brai-translate-btn">🀄 Translate to Chinese</button>
        <div id="brai-translation-box"></div>
      </div>
      <div id="brai-status"></div>
    </div>
  `;
  document.body.appendChild(sidebar);

  // ── Event listeners ──────────────────────────────────────────────────────────
  document.getElementById("brai-toggle-collapse").addEventListener("click", () => {
    sidebar.classList.toggle("brai-collapsed");
    const btn = document.getElementById("brai-toggle-collapse");
    btn.textContent = sidebar.classList.contains("brai-collapsed") ? "▶" : "◀";
  });

  document.getElementById("brai-play-btn").addEventListener("click", () => {
    if (state.playing) {
      // Pause: stop current audio, keep index
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      state.playing = false;
      state.stopped = true;
      updateUI();
      setStatus("Paused");
    } else {
      // Play or resume
      if (state.sentences.length === 0) {
        initSentences();
      }
      if (state.sentences.length === 0) {
        setStatus("No text found on this page.", true);
        return;
      }
      const startIdx = state.stopped ? (state.currentIndex >= state.sentences.length ? 0 : state.currentIndex) : 0;
      playSentences(startIdx);
    }
  });

  document.getElementById("brai-stop-btn").addEventListener("click", () => {
    stopPlayback();
    state.currentIndex = 0;
    setSentenceDisplay("", true);
    updateProgress(0, 1);
    setStatus("Stopped");
  });

  document.getElementById("brai-translate-btn").addEventListener("click", () => {
    const currentSentence = state.sentences[state.currentIndex] || state.sentences[0] || "";
    if (!currentSentence) {
      setTranslation("No sentence to translate. Start playback first.", true);
      return;
    }
    translateSentence(currentSentence);
  });

  return sidebar;
}

function initSentences() {
  const container = getBookContainer();
  if (!container) return;
  const text = extractPlainText(container);
  if (!text) return;

  // Split into paragraphs first, then sentences
  const paras = text.split(/\n{2,}|\r\n{2,}/);
  const sentences = [];
  for (const para of paras) {
    const trimmed = para.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const sents = splitSentences(trimmed);
    sentences.push(...sents);
  }
  state.sentences = sentences.filter((s) => s.length > 3);

  // Build highlights so sentences get <mark> wrappers
  buildHighlights(state.sentences, container);

  setStatus(`Found ${state.sentences.length} sentences`);
}

function updateUI() {
  const playBtn = document.getElementById("brai-play-btn");
  const stopBtn = document.getElementById("brai-stop-btn");
  if (!playBtn) return;

  if (state.playing) {
    playBtn.textContent = "⏸ Pause";
    stopBtn.disabled = false;
  } else {
    playBtn.textContent = "▶ Play";
    stopBtn.disabled = state.stopped && state.currentIndex === 0;
  }
}

function setSentenceDisplay(text, empty = false) {
  const box = document.getElementById("brai-sentence-box");
  if (!box) return;
  if (empty || !text) {
    box.textContent = "Press Play to start reading aloud.";
    box.classList.add("brai-empty");
  } else {
    box.textContent = text;
    box.classList.remove("brai-empty");
  }
}

function updateProgress(current, total) {
  const bar = document.getElementById("brai-progress-bar");
  if (!bar) return;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  bar.style.width = pct + "%";
}

function setStatus(msg, isError = false) {
  const el = document.getElementById("brai-status");
  if (!el) return;
  el.textContent = msg;
  el.className = isError ? "brai-error" : "";
}

function setTranslation(text, loading = false) {
  const box = document.getElementById("brai-translation-box");
  if (!box) return;
  box.textContent = text;
  box.classList.add("brai-visible");
  box.classList.toggle("brai-loading", loading);
}

async function translateSentence(text) {
  const btn = document.getElementById("brai-translate-btn");
  if (btn) btn.disabled = true;
  setTranslation("Translating...", true);

  chrome.runtime.sendMessage(
    {
      type: "TRANSLATE",
      text,
      sourceLang: state.settings.language || "en",
      targetLang: "zh",
    },
    (response) => {
      if (btn) btn.disabled = false;

      if (chrome.runtime.lastError) {
        setTranslation("Translation error: " + chrome.runtime.lastError.message, false);
        return;
      }
      if (response?.error) {
        setTranslation("Translation error: " + response.error, false);
        return;
      }
      setTranslation(response?.translation || "(empty translation)", false);
    }
  );
}

// ── Settings listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SETTINGS_UPDATED") {
    chrome.storage.sync.get(
      { gender: "female", rate: 1.0, language: "en" },
      (settings) => {
        state.settings.gender = settings.gender;
        state.settings.rate = settings.rate;
        state.settings.language = settings.language;
      }
    );
  }
});

// ── Bootstrap ──────────────────────────────────────────────────────────────────
function init() {
  // Load settings first
  chrome.storage.sync.get(
    { gender: "female", rate: 1.0, language: "en" },
    (settings) => {
      state.settings.gender = settings.gender;
      state.settings.rate = settings.rate;
      state.settings.language = settings.language;
    }
  );

  if (!isBookPage()) {
    // Not a book page — still inject the sidebar but show a notice
    const sidebar = buildSidebar();
    setStatus("Open a book page to use TTS.");
    return;
  }

  buildSidebar();
  updateUI();

  // Pre-build sentences + highlights after a short delay so Gutenberg JS
  // has a chance to finish rendering
  setTimeout(initSentences, 800);
}

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

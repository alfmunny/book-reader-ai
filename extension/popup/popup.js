const DEFAULT_BACKEND_URL = "https://book-reader-ai-backend.vercel.app/api";

const backendUrlInput = document.getElementById("backendUrl");
const genderFemaleBtn = document.getElementById("genderFemale");
const genderMaleBtn = document.getElementById("genderMale");
const ttsRateInput = document.getElementById("ttsRate");
const rateDisplay = document.getElementById("rateDisplay");
const ttsLanguageSelect = document.getElementById("ttsLanguage");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

let selectedGender = "female";

// ── Load saved settings ───────────────────────────────────────────────────────
chrome.storage.sync.get(
  {
    backendUrl: DEFAULT_BACKEND_URL,
    gender: "female",
    rate: 1.0,
    language: "en",
  },
  (settings) => {
    backendUrlInput.value = settings.backendUrl;
    ttsRateInput.value = String(settings.rate);
    rateDisplay.textContent = Number(settings.rate).toFixed(1) + "×";
    ttsLanguageSelect.value = settings.language;
    setGender(settings.gender);
  }
);

// ── Gender toggle ─────────────────────────────────────────────────────────────
function setGender(gender) {
  selectedGender = gender;
  genderFemaleBtn.classList.toggle("active", gender === "female");
  genderMaleBtn.classList.toggle("active", gender === "male");
}

genderFemaleBtn.addEventListener("click", () => setGender("female"));
genderMaleBtn.addEventListener("click", () => setGender("male"));

// ── Rate slider ───────────────────────────────────────────────────────────────
ttsRateInput.addEventListener("input", () => {
  rateDisplay.textContent = Number(ttsRateInput.value).toFixed(1) + "×";
});

// ── Save ──────────────────────────────────────────────────────────────────────
saveBtn.addEventListener("click", () => {
  const url = backendUrlInput.value.trim() || DEFAULT_BACKEND_URL;
  const rate = parseFloat(ttsRateInput.value);

  chrome.storage.sync.set(
    {
      backendUrl: url,
      gender: selectedGender,
      rate: isFinite(rate) ? rate : 1.0,
      language: ttsLanguageSelect.value,
    },
    () => {
      if (chrome.runtime.lastError) {
        showStatus("Failed to save: " + chrome.runtime.lastError.message, "error");
      } else {
        showStatus("Settings saved!", "success");
        // Notify any active content script to pick up new settings
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: "SETTINGS_UPDATED" }).catch(() => {});
          }
        });
      }
    }
  );
});

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = "status " + type;
  statusEl.hidden = false;
  setTimeout(() => {
    statusEl.hidden = true;
  }, 2500);
}

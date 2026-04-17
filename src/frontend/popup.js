const API_BASE = "https://api.emailpilot.io"; // change to http://localhost:8000 for local dev

const urlInput = document.getElementById("linkedin-url");
const btnGenerate = document.getElementById("btn-generate");
const spinner = document.getElementById("spinner");
const resultsDiv = document.getElementById("results");
const errorMsg = document.getElementById("error-msg");
const creditsRemaining = document.getElementById("credits-remaining");
const upgradeLink = document.getElementById("upgrade-link");

// Auto-fill URL if current tab is a LinkedIn profile
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab?.url?.includes("linkedin.com/in/")) {
    urlInput.value = tab.url.split("?")[0];
  }
});

// Load saved user state
chrome.storage.local.get(["userId", "credits"], ({ userId, credits }) => {
  if (credits !== undefined) {
    creditsRemaining.textContent = `${credits} credits remaining`;
    if (credits <= 2) upgradeLink.style.display = "inline";
  }
});

btnGenerate.addEventListener("click", async () => {
  const url = urlInput.value.trim();

  if (!url || !url.includes("linkedin.com/in/")) {
    showError("Please enter a valid LinkedIn profile URL (linkedin.com/in/...)");
    return;
  }

  setLoading(true);
  clearResults();

  try {
    const { userId } = await chrome.storage.local.get("userId");

    const response = await fetch(`${API_BASE}/generate-icebreakers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkedin_url: url, user_id: userId || null }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "Server error");
    }

    const data = await response.json();
    renderResults(data);

    // Update credits
    if (data.credits_remaining !== null) {
      chrome.storage.local.set({ credits: data.credits_remaining });
      creditsRemaining.textContent = `${data.credits_remaining} credits remaining`;
      if (data.credits_remaining <= 2) upgradeLink.style.display = "inline";
    }
  } catch (err) {
    showError(err.message || "Failed to connect to EmailPilot API");
  } finally {
    setLoading(false);
  }
});

function renderResults(data) {
  if (data.simulated) {
    const badge = document.createElement("div");
    badge.className = "badge-sim";
    badge.textContent = "SIMULATION MODE — Add API keys for real AI generation";
    resultsDiv.appendChild(badge);
  }

  data.options.forEach((text, i) => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <p>${escapeHtml(text)}</p>
      <button class="btn-copy" data-text="${escapeAttr(text)}">Copy</button>
    `;
    resultsDiv.appendChild(card);
  });

  // Wire up copy buttons
  document.querySelectorAll(".btn-copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(btn.dataset.text);
      btn.textContent = "✓ Copied";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("copied");
      }, 2000);
    });
  });
}

function setLoading(loading) {
  btnGenerate.disabled = loading;
  spinner.style.display = loading ? "block" : "none";
  btnGenerate.textContent = loading ? "Generating..." : "Generate Icebreakers";
}

function clearResults() {
  resultsDiv.innerHTML = "";
  errorMsg.textContent = "";
}

function showError(msg) {
  errorMsg.textContent = msg;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

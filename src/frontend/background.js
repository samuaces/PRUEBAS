// Service worker for EmailPilot Chrome extension

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    // Generate anonymous user ID on first install
    const userId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    chrome.storage.local.set({ userId, credits: 5, installedAt: new Date().toISOString() });

    // Open welcome page
    chrome.tabs.create({ url: "https://emailpilot.io/welcome" });
  }
});

// Relay messages from content script to popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PROFILE_URL_DETECTED") {
    chrome.storage.local.set({ lastLinkedInUrl: message.url });
    sendResponse({ ok: true });
  }
  return true;
});

// Detect LinkedIn profile pages and relay URL to background service worker
if (window.location.href.includes("linkedin.com/in/")) {
  chrome.runtime.sendMessage({
    type: "PROFILE_URL_DETECTED",
    url: window.location.href.split("?")[0],
  });
}

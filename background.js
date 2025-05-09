// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url?.includes("leetcode.com/problems/")
  ) {
    // Inject the content script
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        files: ["config.js", "content.js"],
      })
      .catch((err) => console.error("Failed to inject content script:", err));
  }
});

// Listen for OpenAI API requests from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "callOpenAI") {
    const config = request.config;
    fetch(config.GPT_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.GPT_API_KEY}`,
      },
      body: JSON.stringify(request.body),
    })
      .then((res) => res.json().then((data) => ({ status: res.status, data })))
      .then(({ status, data }) => {
        sendResponse({ status, data });
      })
      .catch((err) => {
        sendResponse({ status: 500, data: { error: err.toString() } });
      });
    return true; // Keep the message channel open for async response
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "toggleLeetCodeGPT" });
});

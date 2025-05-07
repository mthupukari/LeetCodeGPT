document.addEventListener("DOMContentLoaded", function () {
  const chatContainer = document.getElementById("chatContainer");
  const userInput = document.getElementById("userInput");
  const sendButton = document.getElementById("sendButton");
  const loading = document.getElementById("loading");

  let currentTabId = null;
  let chatHistory = [];

  // Function to add a message to the chat
  function addMessage(content, isUser = false) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${
      isUser ? "user-message" : "assistant-message"
    }`;
    if (isUser) {
      // Escape user input for safety
      messageDiv.textContent = content;
    } else {
      // Render HTML for assistant messages
      messageDiv.innerHTML = content;
    }
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // Function to render chat history
  function renderChatHistory() {
    chatContainer.innerHTML = "";
    // Always show the welcome message at the top
    addMessage(
      "Hi! I'm here to help you solve this LeetCode problem. What would you like to know?"
    );
    chatHistory.forEach((msg) => addMessage(msg.content, msg.isUser));
  }

  // Save chat history for the current tab
  function saveChatHistory() {
    if (currentTabId !== null) {
      chrome.storage.local.set({ ["chat_" + currentTabId]: chatHistory });
    }
  }

  // Load chat history for the current tab
  function loadChatHistory(tabId) {
    chrome.storage.local.get(["chat_" + tabId], (result) => {
      chatHistory = result["chat_" + tabId] || [];
      renderChatHistory();
    });
  }

  // Clear chat history for the current tab
  function clearChatHistory(tabId) {
    chrome.storage.local.remove(["chat_" + tabId]);
  }

  // Function to check if we're on a LeetCode problem page
  async function isLeetCodeProblemPage() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab.url?.includes("leetcode.com/problems/");
  }

  // Function to send message to content script
  async function sendMessage(message) {
    try {
      loading.style.display = "block";

      // Check if we're on a LeetCode problem page
      if (!(await isLeetCodeProblemPage())) {
        addMessage(
          "Please navigate to a LeetCode problem page to use this extension."
        );
        return;
      }

      // Get the active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      currentTabId = tab.id;

      // Try to inject the content script if it's not already there
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["config.js", "content.js"],
        });
      } catch (err) {
        console.log(
          "Content script already injected or failed to inject:",
          err
        );
      }

      // Add user message to chat history and save
      chatHistory.push({ content: message, isUser: true });
      saveChatHistory();
      renderChatHistory();

      // Send message to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "getHelp",
        message: message,
        chatHistory: chatHistory,
      });

      if (response && response.answer) {
        chatHistory.push({ content: response.answer, isUser: false });
        saveChatHistory();
        renderChatHistory();
      } else {
        addMessage("Sorry, I encountered an error. Please try again.");
      }
    } catch (error) {
      console.error("Error:", error);
      if (error.message?.includes("Receiving end does not exist")) {
        addMessage("Please refresh the LeetCode page and try again.");
      } else {
        addMessage("Sorry, I encountered an error. Please try again.");
      }
    } finally {
      loading.style.display = "none";
    }
  }

  // Handle send button click
  sendButton.addEventListener("click", async () => {
    const message = userInput.value.trim();
    if (message) {
      userInput.value = "";
      await sendMessage(message);
    }
  });

  // Handle Enter key press
  userInput.addEventListener("keypress", async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendButton.click();
    }
  });

  // On popup open, get the current tab and load chat history
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      currentTabId = tabs[0].id;
      loadChatHistory(currentTabId);
    }
  });

  // Listen for tab removal or navigation to clear chat
  chrome.tabs.onRemoved &&
    chrome.tabs.onRemoved.addListener((tabId) => {
      clearChatHistory(tabId);
    });
  chrome.tabs.onUpdated &&
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "loading" && tabId === currentTabId) {
        clearChatHistory(tabId);
      }
    });
});

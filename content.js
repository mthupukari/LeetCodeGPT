// Function to extract problem information from the page
function extractProblemInfo() {
  console.log("Extracting problem info...");

  // Try different selectors for the title
  const titleSelectors = [
    '[data-cy="question-title"]',
    ".mr-2.text-lg",
    "h3.text-lg",
    ".text-title-large",
    '[data-cy="question-title"] span',
  ];

  let problemTitle = "";
  for (const selector of titleSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      problemTitle = element.textContent.trim();
      console.log(`Found title using selector "${selector}":`, problemTitle);
      break;
    }
  }

  // Try different selectors for the description
  const descriptionSelectors = [
    '[data-cy="question-content"]',
    ".content__u3I1",
    ".question-content__JfgR",
    '[data-cy="question-content"] div',
  ];

  let problemDescription = "";
  for (const selector of descriptionSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      problemDescription = element.innerHTML;
      console.log(
        `Found description using selector "${selector}":`,
        problemDescription.substring(0, 100) + "..."
      );
      break;
    }
  }

  // Try different selectors for the code editor
  const codeSelectors = [
    ".monaco-editor",
    ".CodeMirror",
    ".ace_editor",
    '[data-cy="code-editor"]',
  ];

  let codeEditor = "";
  for (const selector of codeSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      codeEditor = element.textContent;
      console.log(
        `Found code editor using selector "${selector}":`,
        codeEditor.substring(0, 100) + "..."
      );
      break;
    }
  }

  // Log the DOM structure for debugging
  console.log("Current URL:", window.location.href);
  console.log(
    "Document body:",
    document.body.innerHTML.substring(0, 500) + "..."
  );

  return {
    title: problemTitle,
    description: problemDescription,
    currentCode: codeEditor,
  };
}

// Function to get GPT response
async function getGPTResponse(message, problemInfo, chatHistory) {
  console.log("Getting GPT response...");
  const config = window.LeetCodeGPTConfig;
  console.log("Config available:", !!config);

  if (!config || !config.GPT_API_KEY) {
    console.error("API key not configured");
    throw new Error(
      "API key not configured. Please check your config.js file."
    );
  }

  const prompt = `
I'm working on this LeetCode problem:
Title: ${problemInfo.title}
Description: ${problemInfo.description}
Current Code: ${problemInfo.currentCode}

Question: ${message}

Please guide me step by step without giving away the solution. If I have code written, ask about my thought process before providing hints. Help me understand the problem better and work towards an optimal solution.
`;

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful programming assistant that provides hints and guidance for LeetCode problems without giving away complete solutions. Please format your responses using proper HTML paragraph tags (<p>) with spacing between paragraphs. Use <br> for line breaks within paragraphs. You can use <b> for bold text and <code> for code snippets. Do not use bullet points or lists unless specifically requested. Keep the tone conversational and clear.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];
  // Add the rest of the chat history (excluding the latest user message, which is already in the prompt)
  if (Array.isArray(chatHistory)) {
    chatHistory.forEach((msg) => {
      messages.push({
        role: msg.isUser ? "user" : "assistant",
        content: msg.content,
      });
    });
  }

  // Send the API request to the background script
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: "callOpenAI",
        config: config,
        body: {
          model: "gpt-4o",
          messages: messages,
        },
      },
      (response) => {
        const { status, data } = response;
        console.log("Response received:", status);
        console.log("Data parsed:", !!data);

        // Handle OpenAI API errors
        if (data.error) {
          if (status === 429) {
            console.error("OpenAI API rate limit hit:", data.error);
            resolve(
              "You are sending requests too quickly or have hit your usage limit. Please wait a moment and try again."
            );
          } else {
            console.error("OpenAI API error:", data.error);
            resolve(
              `OpenAI API error: ${data.error.message || "Unknown error."}`
            );
          }
          return;
        }

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          console.error("Unexpected API response:", data);
          resolve("Unexpected API response format");
          return;
        }

        resolve(data.choices[0].message.content);
      }
    );
  });
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received:", request.action);
  if (request.action === "getHelp") {
    const problemInfo = extractProblemInfo();
    const chatHistory = request.chatHistory || [];

    getGPTResponse(request.message, problemInfo, chatHistory)
      .then((answer) => {
        console.log("Sending response back to popup");
        sendResponse({ answer });
      })
      .catch((error) => {
        console.error("Error in message handler:", error);
        sendResponse({
          answer:
            "Sorry, I encountered an error. Please check the console for details.",
          error: error.message,
        });
      });

    return true; // Required for async sendResponse
  } else if (request.action === "getProblemInfo") {
    const problemInfo = extractProblemInfo();
    sendResponse({ title: problemInfo.title });
    return true;
  }
});

// Listen for page refresh/load
window.addEventListener("load", () => {
  // Send message to clear chat when page is refreshed/loaded
  chrome.runtime.sendMessage({ action: "clearChat" });
});

// Function to extract problem information from the page
function extractProblemInfo() {
  console.log("Extracting problem info...");
  const problemTitle =
    document.querySelector('[data-cy="question-title"]')?.textContent || "";
  const problemDescription =
    document.querySelector('[data-cy="question-content"]')?.innerHTML || "";
  const codeEditor =
    document.querySelector(".monaco-editor")?.textContent || "";

  console.log("Problem title:", problemTitle);
  console.log("Problem description length:", problemDescription.length);
  console.log("Code editor content length:", codeEditor.length);

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
I am working on a leetcode question, which the problem is below. I am trying to learn how to solve these problems on my own.
Please do not give me any code or solve the problem unless explictly told. I will present the problem, let you think, then explain my thought process.
From then, I want you to help me step by step in guiding me to the solution.
If the answer I do not give at the end is not optimal, help me revise my solution to be optimal.

Sometimes, I will have some code written. Please do not give me any code or solve the problem unless explictly told.
Please take a look at the code and ask me to explain my thought process before giving me any hints.
Problem Title: ${problemInfo.title}
Problem Description: ${problemInfo.description}
Current Code: ${problemInfo.currentCode}

User's Question: ${message}

Please provide a helpful hint or guidance without giving away the complete solution.
Focus on helping the user understand the problem better and guide them towards the solution.
`;

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful programming assistant that provides hints and guidance for LeetCode problems without giving away complete solutions. Please format your responses using HTML tags only (such as <ul>, <ol>, <li>, <b>, <pre>, <code>, etc.) and do not use Markdown.",
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
  }
});

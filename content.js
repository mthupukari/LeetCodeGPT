// Function to extract problem information from the page
function extractProblemInfo() {
  console.log("Extracting problem info...");

  // Try different selectors for the title
  const titleSelectors = [".text-title-large"];

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
  const descriptionSelectors = [".elfjS"];

  let problemDescription = "";
  for (const selector of descriptionSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      // Get all paragraph elements within the description
      const paragraphs = element.querySelectorAll("p");
      if (paragraphs.length > 0) {
        // Join all paragraph texts with newlines
        problemDescription = Array.from(paragraphs)
          .map((p) => p.textContent.trim())
          .filter((text) => text) // Remove empty paragraphs
          .join("\n\n");
      } else {
        // Fallback to getting all text content if no paragraphs found
        problemDescription = element.textContent.trim();
      }
      console.log(
        `Found description using selector "${selector}":`,
        problemDescription.substring(0, 100) + "..."
      );
      break;
    }
  }

  // Try different selectors for the code editor
  const codeSelectors = [".monaco-editor"];

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
  return {
    title: problemTitle,
    description: problemDescription,
    currentCode: codeEditor,
  };
}

// Refactor getGPTResponse to accept a custom prompt
async function getGPTResponseWithCustomPrompt(prompt, chatHistory) {
  console.log("Getting GPT response...");
  const config = window.LeetCodeGPTConfig;
  console.log("Config available:", !!config);

  if (!config || !config.GPT_API_KEY) {
    console.error("API key not configured");
    throw new Error(
      "API key not configured. Please check your config.js file."
    );
  }

  const messages = [
    {
      role: "system",
      content: `You are a helpful and conversational coding assistant embedded inside LeetCode. The user is trying to solve coding problems on their own and wants guidance, not direct solutions. Your role is to help them understand concepts, explore ideas, and troubleshoot — step by step.

DO NOT give full code or final answers unless the user clearly asks for it (e.g., "show me the solution").

Be collaborative and conversational, like a tutor or pair programmer. Ask clarifying or leading questions to help the user think. Always explain *why* a technique works when you discuss one.

When the user asks a general question like "how do I solve this?", respond lightly — give a high-level suggestion, ask a guiding question, or highlight where to begin. Do NOT immediately give a full strategy, pseudocode, or structured breakdown unless the user says they're stuck or asks for more.

When appropriate, you may use markdown formatting to organize your response. Here are some examples:

For a problem breakdown:
## Problem Understanding
Brief explanation of the problem...

## Approach
High-level overview...

## Edge Cases
- Case 1: ...
- Case 2: ...

For code examples:
\`\`\`python
def example():
    # code here
\`\`\`

For hints:
> 💡 Hint: Think about...

For important points:
**Key Point:** This is important because...

For inline code:
Use \`variable\` in your code.

Only use structured formatting when the user:
- asks for a breakdown
- gets stuck
- needs clarification of multiple concepts

Otherwise, keep your replies casual and brief.

Be professional, supportive, and educational in tone. Never assume the user wants a direct answer right away — guide them.`,
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

  // Log the messages being sent to GPT
  console.log("Sending to GPT:\n", {
    systemPrompt: messages[0].content,
    userPrompt: messages[1].content,
    chatHistory: chatHistory,
  });

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

// Inject the sidebar into the LeetCode UI
function injectSidebar() {
  let sidebar = document.getElementById("leetcode-gpt-sidebar");
  if (sidebar) {
    sidebar.style.display = "flex";
    return;
  }

  sidebar = document.createElement("div");
  sidebar.id = "leetcode-gpt-sidebar";
  sidebar.innerHTML = `
    <div id="leetcode-gpt-header">LeetCode GPT</div>
    <div id="leetcode-gpt-chat"></div>
    <textarea id="leetcode-gpt-input" placeholder="Ask for a hint or describe where you're stuck..."></textarea>
  `;
  sidebar.style.display = "flex";

  // Append to #qd-content
  const mainContainer = document.getElementById("qd-content");
  if (mainContainer) {
    mainContainer.appendChild(sidebar);
    // Shrink the main content so the sidebar doesn't cover it
    const flexLayout = mainContainer.querySelector(".flexlayout__layout");
    if (flexLayout) {
      flexLayout.style.width = "calc(100% - 350px)";
    }
    mainContainer.style.position = "relative";
  } else {
    // fallback to overlay
    sidebar.style.position = "fixed";
    sidebar.style.top = "0";
    sidebar.style.right = "0";
    sidebar.style.height = "100vh";
    sidebar.style.zIndex = "9999";
    document.body.appendChild(sidebar);
  }

  setupSidebarChat();
}

// Add MutationObserver logic to handle SPA navigation and late DOM loads
function ensureSidebarInjected() {
  if (document.getElementById("leetcode-gpt-sidebar")) return;

  // Try to find a right-side container in LeetCode's layout
  const rightPanel =
    document.querySelector(".css-1j8gr6w") ||
    document.querySelector(".side-bar__1l4A") ||
    null;

  if (rightPanel) {
    injectSidebar();
  }
}

// Observe DOM changes to handle SPA navigation
const observer = new MutationObserver(() => {
  ensureSidebarInjected();
});
observer.observe(document.body, { childList: true, subtree: true });

// Also try to inject on initial load
ensureSidebarInjected();

// Update setupSidebarChat for first message context logic
function setupSidebarChat() {
  const chatContainer = document.getElementById("leetcode-gpt-chat");
  const userInput = document.getElementById("leetcode-gpt-input");

  let chatHistory = [];
  let isFirstMessage = true;

  function addMessage(content, isUser = false) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `leetcode-gpt-message ${
      isUser ? "user" : "assistant"
    }`;

    if (isUser) {
      // For user messages, just use text content
      messageDiv.textContent = content;
    } else {
      // For assistant messages, parse markdown
      messageDiv.innerHTML = marked.parse(content);
    }

    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // Initial welcome message
  const problemInfo = extractProblemInfo();
  const displayTitle = problemInfo.title
    ? problemInfo.title.replace(/^\d+\.\s*/, "")
    : "this problem";
  addMessage(
    `Hi! I'm here to help you solve <b>${displayTitle}</b>. What would you like to know?`
  );

  async function sendMessage(message) {
    if (!message.trim()) return;

    addMessage(message, true);
    userInput.value = "";
    chatHistory.push({ content: message, isUser: true });

    // Show animated "Thinking..." message and keep a reference to it
    const thinkingDiv = document.createElement("div");
    thinkingDiv.className = "leetcode-gpt-message assistant";
    let dots = 1;
    thinkingDiv.innerHTML = "<i>Thinking.</i>";
    const thinkingInterval = setInterval(() => {
      dots = (dots % 3) + 1;
      thinkingDiv.innerHTML = "<i>Thinking" + ".".repeat(dots) + "</i>";
    }, 500);
    chatContainer.appendChild(thinkingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    let prompt;
    const currentCode = extractProblemInfo().currentCode;

    if (isFirstMessage) {
      // First message: include title, description, and code
      prompt = `
I'm working on this LeetCode problem:
Title: ${problemInfo.title}
Description: ${problemInfo.description}
Current Code: ${currentCode}

Question: ${message}

Please provide a clear, well-structured response. You can use markdown for formatting, including:
- Code blocks with \`\`\`language
- Lists with - or 1.
- **Bold** and *italic* text
- \`inline code\`
- > Blockquotes

Keep your response conversational and guide me through the problem.
      `;
      isFirstMessage = false;
    } else {
      // Subsequent messages: only include code and user message
      prompt = `
Current Code: ${currentCode}

Question: ${message}

Please provide a clear, well-structured response. You can use markdown for formatting.
      `;
    }

    try {
      const answer = await getGPTResponseWithCustomPrompt(prompt, chatHistory);
      console.log("Raw GPT Response:", answer);
      clearInterval(thinkingInterval);
      chatHistory.push({ content: answer, isUser: false });
      thinkingDiv.innerHTML = marked.parse(answer); // Parse markdown in the response
    } catch (err) {
      clearInterval(thinkingInterval);
      thinkingDiv.innerHTML =
        "Sorry, I encountered an error. Please try again.";
    }
  }

  userInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(userInput.value);
    }
  });
}

// Add this at the end of content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleLeetCodeGPT") {
    const sidebar = document.getElementById("leetcode-gpt-sidebar");
    if (sidebar) {
      const mainContainer = document.getElementById("qd-content");
      const flexLayout = mainContainer?.querySelector(".flexlayout__layout");

      if (sidebar.style.display === "none") {
        // Show sidebar
        sidebar.style.display = "flex";
        if (flexLayout) {
          flexLayout.style.width = "calc(100% - 350px)";
        }
      } else {
        // Hide sidebar
        sidebar.style.display = "none";
        if (flexLayout) {
          flexLayout.style.width = "100%";
        }
      }
    } else {
      injectSidebar();
      // Show after injecting
      const newSidebar = document.getElementById("leetcode-gpt-sidebar");
      if (newSidebar) newSidebar.style.display = "flex";
    }
  }
});

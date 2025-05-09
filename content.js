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
      content: `You are a helpful programming assistant that provides hints and guidance for LeetCode problems without giving away complete solutions. 

Format your responses using HTML sections based on what's relevant to the user's question. Use these section templates as needed:

<div class="gpt-section">
  <div class="gpt-section-title">Problem Understanding</div>
  <div class="gpt-section-content">
    <p>Brief explanation of the problem in 2-3 sentences.</p>
  </div>
</div>

<div class="gpt-section">
  <div class="gpt-section-title">Approach</div>
  <div class="gpt-section-content">
    <p>High-level overview of the solution approach.</p>
  </div>
</div>

<div class="gpt-section">
  <div class="gpt-section-title">Solution Steps</div>
  <div class="gpt-section-content">
    <p>1. First step explanation</p>
    <p>2. Second step explanation</p>
    <p>3. Third step explanation</p>
  </div>
</div>

<div class="gpt-section">
  <div class="gpt-section-title">Implementation Hints</div>
  <div class="gpt-section-content">
    <p>Specific hints about implementation details.</p>
    <p>Use <code>code</code> tags for code snippets.</p>
  </div>
</div>

<div class="gpt-section">
  <div class="gpt-section-title">Next Steps</div>
  <div class="gpt-section-content">
    <p>What to try next or what to focus on.</p>
  </div>
</div>

Rules:
1. Only include sections that are relevant to the user's question
2. Keep each section concise and focused
3. Use <code> tags for code snippets
4. Do not use markdown syntax
5. Keep paragraphs short and clear
6. Use proper spacing between sections
7. For simple questions, you can respond with just the relevant section(s) without using the full template structure
8. Make sure you are not always giving away the solution, but rather providing hints and guidance unless the user asks for the solution`,
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
    messageDiv.innerHTML = content;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // Initial welcome message
  const problemInfo = extractProblemInfo();
  addMessage(
    `Hi! I'm here to help you solve <b>${
      problemInfo.title || "this problem"
    }</b>. What would you like to know?`
  );

  async function sendMessage(message) {
    if (!message.trim()) return;

    // Check for test command
    if (message === "!!TESTING") {
      testStyling();
      return;
    }

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

Please provide a clear, well-structured response with the following format:
1. Start with a brief understanding of the problem
2. Break down the approach into clear steps
3. Provide specific hints or guidance
4. End with a suggestion for next steps

Use proper HTML formatting with paragraphs and spacing. Do not use markdown syntax.
      `;
      isFirstMessage = false;
    } else {
      // Subsequent messages: only include code and user message
      prompt = `
Current Code: ${currentCode}

Question: ${message}

Please provide a clear, well-structured response with proper HTML formatting and spacing. Do not use markdown syntax.
      `;
    }

    try {
      const answer = await getGPTResponseWithCustomPrompt(prompt, chatHistory);
      console.log("Raw GPT Response with HTML:", answer);
      clearInterval(thinkingInterval);
      chatHistory.push({ content: answer, isUser: false });
      thinkingDiv.innerHTML = answer; // Replace with the real answer
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
      sidebar.style.display =
        sidebar.style.display === "none" ? "flex" : "none";
    } else {
      injectSidebar();
      // Show after injecting
      const newSidebar = document.getElementById("leetcode-gpt-sidebar");
      if (newSidebar) newSidebar.style.display = "flex";
    }
  }
});

// Add this function to test styling
function testStyling() {
  const testMessage = `
<div class="gpt-section">
  <div class="gpt-section-title">Problem Understanding</div>
  <div class="gpt-section-content">
    <p>This is a sample problem understanding section. It shows how regular text looks with the current styling.</p>
  </div>
</div>

<div class="gpt-section">
  <div class="gpt-section-title">Approach</div>
  <div class="gpt-section-content">
    <p>Here's a sample approach section. Let's see how <code>code snippets</code> look in the text.</p>
  </div>
</div>

<div class="gpt-section">
  <div class="gpt-section-title">Solution Steps</div>
  <div class="gpt-section-content">
    <p>1. First step with some <code>inline code</code></p>
    <p>2. Second step with <i>italic text</i></p>
    <p>3. Third step with regular text</p>
  </div>
</div>

<div class="gpt-section">
  <div class="gpt-section-title">Implementation Hints</div>
  <div class="gpt-section-content">
    <p>Here's a hint with some <code>code</code> and <i>italic text</i> mixed in.</p>
  </div>
</div>

<div class="gpt-section">
  <div class="gpt-section-title">Next Steps</div>
  <div class="gpt-section-content">
    <p>Final section with some concluding text and a <code>code example</code>.</p>
  </div>
</div>`;

  const chatContainer = document.getElementById("leetcode-gpt-chat");
  if (chatContainer) {
    const messageDiv = document.createElement("div");
    messageDiv.className = "leetcode-gpt-message assistant";
    messageDiv.innerHTML = testMessage;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

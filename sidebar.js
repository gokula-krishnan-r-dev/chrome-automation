// Wait for the DOM to be fully loaded
document.addEventListener("DOMContentLoaded", function () {
  // Get elements from the DOM
  const apiKeyInput = document.getElementById("api-key");
  const saveApiKeyButton = document.getElementById("save-api-key");
  const apiKeyStatus = document.getElementById("api-key-status");
  const commandInput = document.getElementById("command");
  const executeCommandButton = document.getElementById("execute-command");
  const commandStatus = document.getElementById("command-status");
  const resultSection = document.getElementById("result-section");
  const resultContent = document.getElementById("result-content");

  // Initialize automation container
  const automationContainer = document.createElement("div");
  automationContainer.className = "automation-container";
  resultSection.appendChild(automationContainer);

  // Create the automation instance
  let automation = null;

  // Load saved API key from storage
  chrome.storage.local.get(["claudeApiKey"], function (result) {
    if (result.claudeApiKey) {
      // Only show first few chars and the rest as asterisks for security
      const maskedKey =
        result.claudeApiKey.substring(0, 10) + "•••••••••••••••";
      apiKeyInput.value = result.claudeApiKey;
      apiKeyStatus.textContent = "API key loaded";
      apiKeyStatus.className = "status-message success";

      // Initialize automation with API key
      automation = new BrowserAutomation({
        apiKey: result.claudeApiKey,
        uiContainer: automationContainer,
        onLogUpdate: updateLogDisplay,
        onStepUpdate: updateStepDisplay,
      });
    }
  });

  // Save API key
  saveApiKeyButton.addEventListener("click", function () {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      apiKeyStatus.textContent = "Please enter a valid API key";
      apiKeyStatus.className = "status-message error";
      return;
    }

    // Basic validation for Anthropic API keys
    if (!apiKey.startsWith("sk-ant-")) {
      apiKeyStatus.textContent =
        'Invalid API key format. Claude keys should start with "sk-ant-"';
      apiKeyStatus.className = "status-message error";
      return;
    }

    // Send message to background script
    chrome.runtime.sendMessage(
      {
        type: "saveApiKey",
        apiKey: apiKey,
      },
      function (response) {
        if (response && response.success) {
          apiKeyStatus.textContent = "API key saved successfully";
          apiKeyStatus.className = "status-message success";

          // Initialize or update automation with new API key
          if (automation) {
            automation.apiKey = apiKey;
          } else {
            automation = new BrowserAutomation({
              apiKey: apiKey,
              uiContainer: automationContainer,
              onLogUpdate: updateLogDisplay,
              onStepUpdate: updateStepDisplay,
            });
          }
        } else {
          apiKeyStatus.textContent = "Failed to save API key";
          apiKeyStatus.className = "status-message error";
        }
      }
    );
  });

  // Execute command
  executeCommandButton.addEventListener("click", async function () {
    const command = commandInput.value.trim();

    if (!command) {
      commandStatus.textContent = "Please enter a command";
      commandStatus.className = "status-message error";
      return;
    }

    // Check if API key is set
    chrome.storage.local.get(["claudeApiKey"], async function (result) {
      if (!result.claudeApiKey) {
        commandStatus.textContent = "Please set your Claude API key first";
        commandStatus.className = "status-message error";
        return;
      }

      // Continue with execution if API key is set
      try {
        // Update UI to show processing
        executeCommandButton.disabled = true;
        commandStatus.textContent = "Processing command...";
        commandStatus.className = "status-message";
        resultContent.innerHTML = "";
        automationContainer.innerHTML = "";

        // Initialize automation if not already done
        if (!automation) {
          automation = new BrowserAutomation({
            apiKey: result.claudeApiKey,
            uiContainer: automationContainer,
            onLogUpdate: updateLogDisplay,
            onStepUpdate: updateStepDisplay,
          });
        }

        // Initialize automation with the command
        commandStatus.textContent = "Analyzing command and planning steps...";
        const initResult = await automation.initialize(command);

        if (!initResult.success) {
          throw new Error(
            initResult.error || "Failed to initialize automation"
          );
        }

        // Execute the steps
        commandStatus.textContent = "Executing steps...";
        const execResult = await automation.executeAll();

        // Re-enable the execute button
        executeCommandButton.disabled = false;

        if (execResult.success) {
          commandStatus.textContent = `Command executed successfully (${execResult.completedSteps}/${execResult.totalSteps} steps completed)`;
          commandStatus.className = "status-message success";
        } else {
          if (execResult.completedSteps > 0) {
            commandStatus.textContent = `Partially completed (${execResult.completedSteps}/${execResult.totalSteps} steps)`;
            commandStatus.className = "status-message warning";
          } else {
            commandStatus.textContent = `Execution failed: ${
              execResult.error || "Unknown error"
            }`;
            commandStatus.className = "status-message error";
          }
        }

        // Show the result section with the data
        resultSection.className = "result-section";

        // Scroll to results
        resultSection.scrollIntoView({ behavior: "smooth" });
      } catch (error) {
        // Re-enable the execute button
        executeCommandButton.disabled = false;

        // Display error
        commandStatus.textContent = `Error: ${error.message}`;
        commandStatus.className = "status-message error";
      }
    });
  });

  // Handle Enter key in command input to execute
  commandInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && event.ctrlKey) {
      executeCommandButton.click();
    }
  });

  // Helper functions for UI updates
  function updateLogDisplay(logs) {
    // This is handled by the automation library internally
    console.log("Log update", logs.length);
  }

  function updateStepDisplay(steps, currentStep, results) {
    // This is handled by the automation library internally
    console.log("Step update", steps.length, currentStep);
  }
});

// Add stylesheet for automation UI
function addAutomationStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .automation-container {
      margin-top: 15px;
      border: 1px solid #ccc;
      border-radius: 5px;
      overflow: hidden;
    }
    
    .automation-logs {
      max-height: 200px;
      overflow-y: auto;
      background-color: #f5f5f5;
      padding: 10px;
      font-family: monospace;
      font-size: 12px;
    }
    
    .log-entry {
      margin-bottom: 5px;
      padding: 3px 0;
      border-bottom: 1px solid #eee;
    }
    
    .log-error {
      color: #d32f2f;
    }
    
    .log-warn {
      color: #f57c00;
    }
    
    .log-success {
      color: #388e3c;
    }
    
    .automation-steps {
      border-top: 1px solid #ccc;
      padding: 10px;
    }
    
    .overall-explanation {
      padding: 10px;
      margin-bottom: 10px;
      background-color: #e3f2fd;
      border-radius: 5px;
    }
    
    .step-entry {
      margin-bottom: 10px;
      padding: 8px;
      border-left: 3px solid #ccc;
      background-color: #f9f9f9;
    }
    
    .step-header {
      display: flex;
      align-items: center;
      margin-bottom: 5px;
    }
    
    .step-number {
      display: inline-block;
      width: 24px;
      height: 24px;
      line-height: 24px;
      text-align: center;
      background-color: #ccc;
      color: white;
      border-radius: 50%;
      margin-right: 10px;
    }
    
    .step-details {
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      background-color: #f1f1f1;
      padding: 5px;
      border-radius: 3px;
      max-height: 100px;
      overflow-y: auto;
    }
    
    .step-error-message {
      color: #d32f2f;
      margin-top: 5px;
      padding: 5px;
      background-color: #ffebee;
      border-radius: 3px;
    }
    
    .current-step {
      border-left-color: #2196f3;
      background-color: #e3f2fd;
    }
    
    .step-success {
      border-left-color: #4caf50;
    }
    
    .step-error {
      border-left-color: #f44336;
    }
  `;
  document.head.appendChild(style);
}

// Add styles when DOM is loaded
document.addEventListener("DOMContentLoaded", addAutomationStyles);

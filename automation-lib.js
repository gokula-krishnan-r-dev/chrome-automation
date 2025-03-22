/**
 * Browser Automation Library with AI-assisted error recovery
 *
 * This library provides functionality to:
 * 1. Execute browser automation steps defined by AI
 * 2. Handle failures with up to 3 retry attempts with different strategies
 * 3. Take screenshots on failure and consult AI for better approaches
 * 4. Log execution progress and show steps in the UI
 */

class BrowserAutomation {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.currentStep = 0;
    this.steps = [];
    this.logs = [];
    this.results = [];
    this.apiKey = options.apiKey || "";
    this.uiContainer = options.uiContainer || null;
    this.onLogUpdate = options.onLogUpdate || (() => {});
    this.onStepUpdate = options.onStepUpdate || (() => {});
    this.apiUrl = options.apiUrl || "https://api.anthropic.com/v1/messages";
  }

  /**
   * Initialize with a command to be executed
   * @param {string} command - The command to execute
   */
  async initialize(command) {
    this.log("Initializing automation with command: " + command);
    this.command = command;

    try {
      // Get current tab and take screenshot
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab) {
        throw new Error("No active tab found");
      }

      this.tabId = tab.id;
      const screenshot = await this.captureScreenshot();

      // Process the command with Claude to get steps
      const response = await this.processCommandWithClaude(command, screenshot);
      if (!response || !response.steps || !Array.isArray(response.steps)) {
        throw new Error("Invalid response from AI");
      }

      this.steps = response.steps;
      this.overallExplanation = response.overallExplanation || "";
      this.log("Received execution plan with " + this.steps.length + " steps");

      // Update UI with the plan
      this.updateStepsList();

      return {
        success: true,
        steps: this.steps,
        overallExplanation: this.overallExplanation,
      };
    } catch (error) {
      this.log("Initialization failed: " + error.message, "error");
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute all steps in the plan
   */
  async executeAll() {
    if (!this.steps || this.steps.length === 0) {
      this.log("No steps to execute", "warn");
      return {
        success: false,
        error: "No steps to execute",
        completedSteps: 0,
        totalSteps: 0,
      };
    }

    this.log("Starting execution of " + this.steps.length + " steps");
    let completedSteps = 0;

    for (let i = 0; i < this.steps.length; i++) {
      this.currentStep = i;
      const step = this.steps[i];
      this.updateStepsList();

      const result = await this.executeStep(step, i);
      this.results[i] = result;

      if (result.success) {
        completedSteps++;
        this.log(
          `Step ${i + 1} completed successfully: ${
            step.explanation || step.action
          }`,
          "success"
        );
      } else {
        this.log(`Step ${i + 1} failed: ${result.error}`, "error");

        // Try to recover and continue if possible
        const recoveryResult = await this.recoverFailedStep(
          step,
          i,
          result.error
        );
        if (recoveryResult.success) {
          completedSteps++;
          this.log(`Step ${i + 1} recovered and completed`, "success");
        } else {
          this.log(
            `Failed to recover step ${i + 1} after ${this.maxRetries} attempts`,
            "error"
          );
          // Don't break, try to continue with the next steps
        }
      }

      // Small pause between steps
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return {
      success: completedSteps === this.steps.length,
      completedSteps,
      totalSteps: this.steps.length,
      results: this.results,
      steps: this.steps,
      overallExplanation: this.overallExplanation,
    };
  }

  /**
   * Execute a single step with the content script
   * @param {Object} step - The step to execute
   * @param {number} index - The index of the step
   */
  async executeStep(step, index) {
    this.log(`Executing step ${index + 1}: ${step.explanation || step.action}`);

    try {
      return await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          this.tabId,
          {
            type: "executeAction",
            actionData: step,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.error) {
              resolve({ success: false, error: response.error });
            } else {
              resolve({ success: true, result: response?.result });
            }
          }
        );
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Attempt to recover from a failed step
   * @param {Object} step - The step that failed
   * @param {number} index - The index of the step
   * @param {string} error - The error message
   */
  async recoverFailedStep(step, index, error) {
    this.log(`Attempting to recover failed step ${index + 1}`);

    let lastError = error;
    let screenshot = await this.captureScreenshot();

    // Try multiple recovery strategies
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      this.log(`Recovery attempt ${attempt}/${this.maxRetries}`);

      try {
        // Ask Claude for a new approach
        const recoveryResponse = await this.getRecoveryStrategy(
          this.command,
          step,
          screenshot,
          lastError,
          attempt
        );

        if (!recoveryResponse || !recoveryResponse.alternativeStep) {
          throw new Error("Invalid recovery response from AI");
        }

        const alternativeStep = recoveryResponse.alternativeStep;
        this.log(
          `Trying alternative approach: ${
            alternativeStep.explanation || alternativeStep.action
          }`
        );

        // Execute the alternative step
        const result = await this.executeStep(alternativeStep, index);

        if (result.success) {
          // Update the step in the original plan
          this.steps[index] = alternativeStep;
          this.updateStepsList();
          return { success: true, result };
        }

        // If still failing, update the error for the next attempt
        lastError = result.error;
        // Take a new screenshot for the next attempt
        screenshot = await this.captureScreenshot();
      } catch (error) {
        lastError = error.message;
        this.log(
          `Recovery attempt ${attempt} failed: ${error.message}`,
          "error"
        );
      }
    }

    return { success: false, error: lastError };
  }

  /**
   * Process a command with Claude AI to get execution steps
   * @param {string} command - The command to process
   * @param {string} screenshot - Base64 screenshot data
   */
  async processCommandWithClaude(command, screenshot) {
    this.log("Processing command with AI");

    // Check if API key is available
    if (!this.apiKey) {
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        throw new Error("API key not set");
      }
      this.apiKey = apiKey;
    }

    try {
      // Convert base64 to binary
      const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");

      // Make request to Claude API
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "yes",
        },
        body: JSON.stringify({
          model: "claude-3-7-sonnet-20250219",
          max_tokens: 10000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze this webpage screenshot and execute this command: "${command}". 
                         Break down the command into a series of steps if it's complex.
                         
                         Respond with ONLY a single valid JSON object with the following structure:
                         {
                           "steps": [
                             {
                               "action": "click" | "type" | "extract" | "navigate" | "scroll" | "none",
                               "coordinates": { "x": number, "y": number } (REQUIRED for click and type actions),
                               "text": string (if applicable for typing or extraction),
                               "url": string (if applicable for navigation),
                               "explanation": string (explaining what this step does),
                               "scrollDirection": "up" | "down" | "left" | "right" (if applicable),
                               "scrollAmount": number (if applicable)
                             },
                             ... additional steps as needed
                           ],
                           "overallExplanation": string (explaining the overall plan)
                         }
                         
                         CRITICAL JSON FORMATTING RULES - FOLLOW THESE EXACTLY:
                         1. Use DOUBLE QUOTES for ALL property names: "action", "coordinates", etc.
                         2. Use DOUBLE QUOTES for ALL string values: "click", "type", etc.
                         3. DO NOT use single quotes anywhere in the JSON
                         4. Ensure the JSON is properly formatted with no trailing commas
                         5. Make sure all objects have proper opening and closing braces
                         6. Make sure all arrays have proper opening and closing brackets
                         7. Make sure all property/value pairs are separated by commas
                         8. Make sure the last property in an object does NOT have a trailing comma
                         9. Verify your JSON is valid before returning it
                         
                         IMPORTANT COORDINATE GUIDELINES:
                         1. For "click" and "type" actions, provide PRECISE coordinates of the CENTER of the element
                         2. For search buttons, look carefully at the page and identify the exact location
                         3. Coordinates must be numbers (not strings) - e.g., "x": 150, not "x": "150"
                         4. If you're unsure about exact coordinates, provide your best estimate`,
                },
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${errorText}`);
      }

      const data = await response.json();

      if (!data.content || !data.content[0] || !data.content[0].text) {
        throw new Error("Invalid response from Claude API");
      }

      // Extract and parse the JSON response
      const responseText = data.content[0].text;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error("Could not find valid JSON in Claude response");
      }

      const jsonString = jsonMatch[0];
      return JSON.parse(jsonString);
    } catch (error) {
      this.log("Error processing command: " + error.message, "error");
      throw error;
    }
  }

  /**
   * Get a recovery strategy from Claude for a failed step
   * @param {string} command - The original command
   * @param {Object} failedStep - The step that failed
   * @param {string} screenshot - Base64 screenshot data
   * @param {string} error - The error message
   * @param {number} attempt - The attempt number
   */
  async getRecoveryStrategy(command, failedStep, screenshot, error, attempt) {
    this.log(`Requesting AI assistance for recovery attempt ${attempt}`);

    // Check if API key is available
    if (!this.apiKey) {
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        throw new Error("API key not set");
      }
      this.apiKey = apiKey;
    }

    try {
      // Convert base64 to binary
      const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");

      // Make request to Claude API
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "yes",
        },
        body: JSON.stringify({
          model: "claude-3-7-sonnet-20250219",
          max_tokens: 10000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `This step in browser automation has failed:
                         
                         Original command: "${command}"
                         
                         Failed step: ${JSON.stringify(failedStep, null, 2)}
                         
                         Error message: "${error}"
                         
                         This is recovery attempt ${attempt} of ${
                    this.maxRetries
                  }.
                         
                         Based on the screenshot, please provide an alternative approach to accomplish the same task.
                         Use a different strategy than the previous attempt.
                         
                         Respond with ONLY a single valid JSON object with the following structure:
                         {
                           "analysis": "Brief analysis of what went wrong",
                           "alternativeStep": {
                             "action": "click" | "type" | "extract" | "navigate" | "scroll" | "none",
                             "coordinates": { "x": number, "y": number } (if applicable),
                             "text": string (if applicable),
                             "url": string (if applicable),
                             "explanation": string (explaining the alternative approach),
                             "scrollDirection": "up" | "down" | "left" | "right" (if applicable),
                             "scrollAmount": number (if applicable)
                           }
                         }
                         
                         IMPORTANT: 
                         1. The alternativeStep must be different from the failed step
                         2. Your JSON must be valid
                         3. All coordinate values must be numbers, not strings
                         4. Provide precise coordinates based on the screenshot
                         5. Make sure your approach has a high chance of success`,
                },
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${errorText}`);
      }

      const data = await response.json();

      if (!data.content || !data.content[0] || !data.content[0].text) {
        throw new Error("Invalid response from Claude API");
      }

      // Extract and parse the JSON response
      const responseText = data.content[0].text;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error("Could not find valid JSON in Claude response");
      }

      const jsonString = jsonMatch[0];
      return JSON.parse(jsonString);
    } catch (error) {
      this.log("Error getting recovery strategy: " + error.message, "error");
      throw error;
    }
  }

  /**
   * Capture screenshot of the current tab
   */
  async captureScreenshot() {
    this.log("Capturing screenshot");

    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!dataUrl) {
            reject(new Error("Failed to capture screenshot (empty result)"));
          } else {
            resolve(dataUrl);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get API key from storage
   */
  async getApiKey() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["claudeApiKey"], function (result) {
        resolve(result.claudeApiKey || "");
      });
    });
  }

  /**
   * Add a log entry
   * @param {string} message - The log message
   * @param {string} level - The log level (info, warn, error, success)
   */
  log(message, level = "info") {
    const logEntry = {
      timestamp: new Date(),
      message,
      level,
    };

    this.logs.push(logEntry);
    console.log(`[${level.toUpperCase()}] ${message}`);

    // Call the log update callback if provided
    this.onLogUpdate(this.logs);

    // Update UI if container is provided
    if (this.uiContainer) {
      this.updateLogsUI();
    }
  }

  /**
   * Update the steps list in the UI
   */
  updateStepsList() {
    // Call the step update callback if provided
    this.onStepUpdate(this.steps, this.currentStep, this.results);

    // Update UI if container is provided
    if (this.uiContainer) {
      this.updateStepsUI();
    }
  }

  /**
   * Update the logs in the UI container
   */
  updateLogsUI() {
    if (!this.uiContainer) return;

    const logsContainer =
      this.uiContainer.querySelector(".automation-logs") ||
      document.createElement("div");
    logsContainer.className = "automation-logs";
    logsContainer.innerHTML = "";

    this.logs.forEach((log) => {
      const logElement = document.createElement("div");
      logElement.className = `log-entry log-${log.level}`;
      logElement.textContent = `[${log.timestamp.toLocaleTimeString()}] ${
        log.message
      }`;
      logsContainer.appendChild(logElement);
    });

    // Add to UI container if not already there
    if (!this.uiContainer.querySelector(".automation-logs")) {
      this.uiContainer.appendChild(logsContainer);
    }

    // Scroll to bottom
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }

  /**
   * Update the steps in the UI container
   */
  updateStepsUI() {
    if (!this.uiContainer) return;

    const stepsContainer =
      this.uiContainer.querySelector(".automation-steps") ||
      document.createElement("div");
    stepsContainer.className = "automation-steps";
    stepsContainer.innerHTML = "";

    // Add overall explanation
    if (this.overallExplanation) {
      const explanationElement = document.createElement("div");
      explanationElement.className = "overall-explanation";
      explanationElement.textContent = this.overallExplanation;
      stepsContainer.appendChild(explanationElement);
    }

    // Add steps
    this.steps.forEach((step, index) => {
      const stepElement = document.createElement("div");
      stepElement.className = "step-entry";

      // Highlight current step
      if (index === this.currentStep) {
        stepElement.className += " current-step";
      }

      // Add status indicator
      const result = this.results[index];
      if (result) {
        stepElement.className += result.success
          ? " step-success"
          : " step-error";
      }

      stepElement.innerHTML = `
        <div class="step-header">
          <span class="step-number">${index + 1}</span>
          <span class="step-explanation">${
            step.explanation || step.action
          }</span>
        </div>
        <div class="step-details">
          <code>${JSON.stringify(step, null, 2)}</code>
          ${
            result && result.error
              ? `<div class="step-error-message">${result.error}</div>`
              : ""
          }
        </div>
      `;

      stepsContainer.appendChild(stepElement);
    });

    // Add to UI container if not already there
    if (!this.uiContainer.querySelector(".automation-steps")) {
      this.uiContainer.appendChild(stepsContainer);
    }
  }
}

// Export the class
if (typeof module !== "undefined") {
  module.exports = { BrowserAutomation };
}

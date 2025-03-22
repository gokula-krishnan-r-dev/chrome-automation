/**
 * Demo script to showcase the BrowserAutomation library with recovery.
 * This demonstrates how the library handles failures and retries.
 */

// Default values - these can be overridden by the demo.html page
window.testCommand =
  window.testCommand ||
  "Go to priceline.com and search for flights from Las Vegas to San Francisco for next weekend";
window.mockContainer = window.mockContainer || document.createElement("div");

// Create a demo implementation to test the recovery mechanisms
async function runDemo() {
  console.log("Starting Browser Automation demo with failure recovery...");

  // Create a demo automation instance
  const automation = new BrowserAutomation({
    uiContainer: window.mockContainer,
    // Mock API key for demo
    apiKey: "sk-ant-demo-key",
    // Custom methods for demo purposes
    processCommandWithClaude: mockProcessCommand,
    getRecoveryStrategy: mockRecoveryStrategy,
    captureScreenshot: mockCaptureScreenshot,
    executeStep: mockExecuteStep,
  });

  // Log the demo start
  automation.log("Starting demo with command: " + window.testCommand);

  // Initialize the automation
  const initResult = await automation.initialize(window.testCommand);

  if (!initResult.success) {
    automation.log("Failed to initialize: " + initResult.error, "error");
    return;
  }

  // Execute all steps
  const result = await automation.executeAll();

  // Show final results
  automation.log(
    "Demo completed with " +
      result.completedSteps +
      "/" +
      result.totalSteps +
      " steps",
    result.success ? "success" : "warning"
  );
}

// Mock implementation of processCommandWithClaude
async function mockProcessCommand(command, screenshot) {
  console.log("[MOCK] Processing command:", command);

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Generate steps based on the command
  const steps = generateStepsForCommand(command);

  return {
    overallExplanation: `Execute command: ${command}`,
    steps: steps,
  };
}

// Generate steps based on the command text
function generateStepsForCommand(command) {
  // Default steps
  let steps = [
    {
      action: "navigate",
      url: "https://www.example.com",
      explanation: "Navigate to example.com",
    },
  ];

  // Parse the command to generate more specific steps
  const lowerCommand = command.toLowerCase();

  if (lowerCommand.includes("priceline")) {
    steps = [
      {
        action: "navigate",
        url: "https://www.priceline.com",
        explanation: "Navigate to Priceline.com",
      },
      {
        action: "click",
        coordinates: { x: 150, y: 120 },
        explanation: "Click on the Flights tab",
      },
    ];

    // Check for flight search
    if (lowerCommand.includes("flight")) {
      // Extract origin and destination if present
      let origin = "Las Vegas";
      let destination = "San Francisco";

      if (lowerCommand.includes("from")) {
        const fromPattern = /from\s+([a-z ]+)\s+to/i;
        const match = lowerCommand.match(fromPattern);
        if (match && match[1]) {
          origin = match[1].trim();
        }
      }

      if (lowerCommand.includes("to")) {
        const toPattern = /to\s+([a-z ]+)(?:\s+for|\s*$)/i;
        const match = lowerCommand.match(toPattern);
        if (match && match[1]) {
          destination = match[1].trim();
        }
      }

      steps.push(
        {
          action: "type",
          coordinates: { x: 250, y: 200 },
          text: origin,
          explanation: `Enter '${origin}' in the origin field`,
        },
        {
          action: "type",
          coordinates: { x: 450, y: 200 },
          text: destination,
          explanation: `Enter '${destination}' in the destination field`,
        },
        {
          action: "click",
          coordinates: { x: 300, y: 250 },
          explanation: "Click on the search button",
        }
      );
    }
  } else if (lowerCommand.includes("amazon")) {
    steps = [
      {
        action: "navigate",
        url: "https://www.amazon.com",
        explanation: "Navigate to Amazon.com",
      },
    ];

    // Check for search
    if (lowerCommand.includes("search")) {
      const searchPattern = /search\s+for\s+([a-z0-9 ]+)(?:\s+and|\s*$)/i;
      const match = lowerCommand.match(searchPattern);
      let searchTerm = "products";

      if (match && match[1]) {
        searchTerm = match[1].trim();
      }

      steps.push(
        {
          action: "type",
          coordinates: { x: 400, y: 60 },
          text: searchTerm,
          explanation: `Type '${searchTerm}' in the search box`,
        },
        {
          action: "click",
          coordinates: { x: 500, y: 60 },
          explanation: "Click the search button",
        }
      );
    }
  } else if (lowerCommand.includes("weather")) {
    steps = [
      {
        action: "navigate",
        url: "https://www.weather.com",
        explanation: "Navigate to Weather.com",
      },
    ];

    // Check for location
    const locationPattern = /(?:for|in)\s+([a-z ]+)(?:\s+and|\s*$)/i;
    const match = lowerCommand.match(locationPattern);
    let location = "Current Location";

    if (match && match[1]) {
      location = match[1].trim();
    }

    steps.push(
      {
        action: "type",
        coordinates: { x: 300, y: 80 },
        text: location,
        explanation: `Enter '${location}' in the search field`,
      },
      {
        action: "click",
        coordinates: { x: 350, y: 80 },
        explanation: "Click the search button",
      },
      {
        action: "extract",
        coordinates: { x: 400, y: 250 },
        explanation: "Extract the weather information",
      }
    );
  } else if (lowerCommand.includes("gmail")) {
    steps = [
      {
        action: "navigate",
        url: "https://www.gmail.com",
        explanation: "Navigate to Gmail.com",
      },
    ];

    if (lowerCommand.includes("compose")) {
      steps.push(
        {
          action: "click",
          coordinates: { x: 120, y: 150 },
          explanation: "Click on the Compose button",
        },
        {
          action: "type",
          coordinates: { x: 400, y: 200 },
          text: "example@example.com",
          explanation: "Enter recipient email address",
        },
        {
          action: "type",
          coordinates: { x: 400, y: 250 },
          text: "Email Subject",
          explanation: "Enter email subject",
        }
      );
    }
  } else if (
    lowerCommand.includes("twitter") ||
    lowerCommand.includes("x.com")
  ) {
    steps = [
      {
        action: "navigate",
        url: "https://twitter.com",
        explanation: "Navigate to Twitter.com",
      },
    ];

    if (lowerCommand.includes("search")) {
      const searchPattern = /search\s+for\s+([a-z0-9#@ ]+)(?:\s+and|\s*$)/i;
      const match = lowerCommand.match(searchPattern);
      let searchTerm = "#trending";

      if (match && match[1]) {
        searchTerm = match[1].trim();
      }

      steps.push(
        {
          action: "click",
          coordinates: { x: 400, y: 60 },
          explanation: "Click on the search box",
        },
        {
          action: "type",
          coordinates: { x: 400, y: 60 },
          text: searchTerm,
          explanation: `Type '${searchTerm}' in the search box`,
        },
        {
          action: "click",
          coordinates: { x: 450, y: 100 },
          explanation: "Click on the first search result",
        }
      );
    }
  }

  return steps;
}

// Mock implementation of getRecoveryStrategy
async function mockRecoveryStrategy(
  command,
  failedStep,
  screenshot,
  error,
  attempt
) {
  console.log("[MOCK] Getting recovery strategy for step:", failedStep);

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Return a different strategy based on the attempt number
  const alternativeStep = { ...failedStep };

  // Adjust coordinates or change approach based on attempt number
  if (attempt === 1) {
    // First attempt: Try slightly different coordinates
    if (alternativeStep.coordinates) {
      alternativeStep.coordinates.x += 20;
      alternativeStep.coordinates.y += 10;
    }
    alternativeStep.explanation = `Retry with adjusted coordinates (attempt ${attempt})`;
    alternativeStep.isRecoveryAttempt = true;
  } else if (attempt === 2) {
    // Second attempt: Try a different element or approach
    if (alternativeStep.action === "click") {
      // Try double clicking instead
      alternativeStep.action = "doubleClick";
      alternativeStep.explanation = `Try double clicking instead (attempt ${attempt})`;
    } else if (alternativeStep.action === "type") {
      // Try clicking first, then typing
      alternativeStep.action = "click";
      alternativeStep.explanation = `Click the field first before typing (attempt ${attempt})`;
    }
    alternativeStep.isRecoveryAttempt = true;
  } else {
    // Third attempt: Try a completely different approach
    if (
      alternativeStep.action === "click" &&
      alternativeStep.explanation.includes("search button")
    ) {
      // Try pressing Enter key instead of clicking search
      alternativeStep.action = "pressKey";
      alternativeStep.key = "Enter";
      alternativeStep.coordinates = null;
      alternativeStep.explanation = `Press Enter key instead of clicking search button (attempt ${attempt})`;
    } else {
      // Last resort: Try a more generic fallback
      alternativeStep.explanation = `Using fallback method (attempt ${attempt})`;
      // Simulate using different selectors or approaches
      if (alternativeStep.coordinates) {
        alternativeStep.coordinates.x += 50;
        alternativeStep.coordinates.y -= 30;
      }
    }
    alternativeStep.isRecoveryAttempt = true;
  }

  return {
    analysis: `Failed with error: ${error}. Trying alternative approach.`,
    alternativeStep: alternativeStep,
  };
}

// Mock implementation of captureScreenshot
async function mockCaptureScreenshot() {
  console.log("[MOCK] Capturing screenshot");

  // Simulate delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Return a mock screenshot (base64 string representation)
  return "data:image/png;base64,mockScreenshot123";
}

// Mock implementation of executeStep
async function mockExecuteStep(step, index) {
  console.log("[MOCK] Executing step:", step);

  // Simulate execution delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Simulate success/failure based on step index and recovery attempt status
  // Make steps 1 and 3 (2nd and 4th steps) always fail on first attempt to demonstrate recovery
  if ((index === 1 || index === 3) && !step.isRecoveryAttempt) {
    return {
      success: false,
      error: `Failed to ${step.action} at coordinates ${JSON.stringify(
        step.coordinates
      )}: Element not found`,
    };
  }

  // Add a random factor for other steps (80% success rate)
  const randomSuccess = Math.random() > 0.2;

  if (randomSuccess) {
    return {
      success: true,
      result: { message: `Successfully executed ${step.action}` },
    };
  } else {
    return {
      success: false,
      error: `Random failure when trying to ${step.action}: Element state changed`,
    };
  }
}

// Only add the demo button and container when running standalone
if (!document.querySelector(".demo-container")) {
  // Add a button to the page to run the demo
  function addDemoButton() {
    const button = document.createElement("button");
    button.textContent = "Run Browser Automation Demo";
    button.style.padding = "10px";
    button.style.margin = "20px";
    button.style.backgroundColor = "#4285F4";
    button.style.color = "white";
    button.style.border = "none";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";

    button.addEventListener("click", runDemo);

    document.body.insertBefore(button, document.body.firstChild);
  }

  // Add some styles for the demo container
  function addDemoStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .demo-container {
        margin: 20px;
        padding: 20px;
        border: 1px solid #ccc;
        border-radius: 5px;
        max-width: 800px;
        background-color: #f9f9f9;
      }
      
      .demo-title {
        font-size: 20px;
        margin-bottom: 15px;
        color: #4285F4;
      }
    `;
    document.head.appendChild(style);
  }

  // Initialize the demo
  document.addEventListener("DOMContentLoaded", function () {
    addDemoStyles();
    addDemoButton();

    const demoContainer = document.createElement("div");
    demoContainer.className = "demo-container";
    demoContainer.innerHTML = `
      <div class="demo-title">Browser Automation with Dynamic Recovery</div>
      <p>This demo shows how the automation library handles failures and retries with different strategies.</p>
      <p>Click the button above to run the demo and watch the steps execute with automatic recovery.</p>
    `;

    document.body.appendChild(demoContainer);

    // Add the mock container to the demo container
    demoContainer.appendChild(window.mockContainer);
  });
}

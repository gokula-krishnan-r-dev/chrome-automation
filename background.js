// Anthropic API configuration
const API_URL = 'https://api.anthropic.com/v1/messages';
let API_KEY = ''; // Will be loaded from storage

// Load API key from storage
chrome.storage.local.get(['claudeApiKey'], (result) => {
  if (result.claudeApiKey) {
    API_KEY = result.claudeApiKey;
    console.log('API key loaded from storage, length:', API_KEY.length);
  }
});

// Handle extension icon click to open the side panel
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Listen for messages from the popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background script received message type:', message.type);
  
  if (message.type === 'saveApiKey') {
    // Save API key to storage
    API_KEY = message.apiKey;
    chrome.storage.local.set({ claudeApiKey: API_KEY }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving API key:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('API key saved successfully, length:', API_KEY.length);
        sendResponse({ success: true });
      }
    });
    return true;
  }
  
  if (message.type === 'executeCommand') {
    const { command, screenshot, tabId } = message;
    
    if (!API_KEY) {
      console.error('API key not set');
      sendResponse({ error: 'API key not set. Please set it in the extension popup.' });
      return true;
    }
    
    if (!screenshot) {
      console.error('No screenshot provided');
      sendResponse({ error: 'Failed to capture screenshot. Please try again.' });
      return true;
    }
    
    if (!tabId) {
      console.error('No tab ID provided');
      sendResponse({ error: 'No active tab found. Please make sure you have an active tab.' });
      return true;
    }
    
    // Process the command with Claude
    processCommandWithClaude(command, screenshot, tabId)
      .then(response => {
        sendResponse({ success: true, response });
      })
      .catch(error => {
        console.error('Error processing command:', error);
        
        // Provide more user-friendly error messages
        let userMessage = error.message || 'Failed to process command';
        
        // Common error cases with more helpful messages
        if (userMessage.includes('Failed to fetch')) {
          userMessage = 'Network error: Could not connect to Claude API. Please check your internet connection and try again.';
        } else if (userMessage.includes('invalid_api_key')) {
          userMessage = 'Invalid API key: The Claude API key you provided is not valid. Please update your API key.';
        } else if (userMessage.includes('quota')) {
          userMessage = 'API quota exceeded: Your Claude API usage limit has been reached. Please check your account.';
        } else if (userMessage.includes('timeout')) {
          userMessage = 'Request timeout: The connection to Claude API timed out. Please try again later.';
        }
        
        sendResponse({ error: userMessage });
      });
    
    return true; // Required for async sendResponse
  }
});

// Helper function to create a timeout signal with browser compatibility
function createTimeoutSignal(timeoutMs) {
  // Check if AbortSignal.timeout is supported (added in newer browsers)
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  } else {
    // Fallback for browsers that don't support AbortSignal.timeout
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    return controller.signal;
  }
}

// Function to process a command with Claude
async function processCommandWithClaude(command, screenshot, tabId) {
  // Prepare the Claude API request payload
  const requestBody = {
    model: 'claude-3-7-sonnet-20250219',
    max_tokens: 10000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
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
                   5. Do not include any text, explanation, or markdown before or after the JSON object
                   6. Make sure all objects have proper opening and closing braces
                   7. Make sure all arrays have proper opening and closing brackets
                   8. Make sure all property/value pairs are separated by commas
                   9. Make sure the last property in an object does NOT have a trailing comma
                   10. Verify your JSON is valid before returning it
                   
                   IMPORTANT COORDINATE GUIDELINES:
                   1. For "click" and "type" actions, provide PRECISE coordinates of the CENTER of the element
                   2. For search buttons, look carefully at the page and identify the exact location
                   3. Coordinates must be numbers (not strings) - e.g., "x": 150, not "x": "150"
                   4. If you're unsure about exact coordinates, provide your best estimate
                   
                   IMPORTANT: For "type" actions, always include both "text" AND "coordinates" fields.
                   The coordinates should match the location of the input field where text should be typed.`
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: screenshot.split(',')[1] // Remove "data:image/png;base64," prefix
            }
          }
        ]
      }
    ]
  };

  try {
    console.log('Making API request to Claude with API key:', API_KEY.substring(0, 10) + '...');
    
    // Make the API request to Claude
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(requestBody),
      // Add timeout to prevent hanging requests
      signal: createTimeoutSignal(60000) // 60 second timeout
    }).catch(error => {
      console.error('Fetch error:', error);
      throw new Error(`Network error: ${error.message}`);
    });

    if (!response.ok) {
      let errorMessage = `HTTP error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = `Claude API error: ${errorData.error?.message || response.statusText}`;
      } catch (e) {
        // If we can't parse the error as JSON, just use the status text
        console.error('Error parsing error response:', e);
      }
      throw new Error(errorMessage);
    }

    const responseData = await response.json().catch(error => {
      console.error('Error parsing JSON response:', error);
      throw new Error('Failed to parse response from Claude API');
    });
    
    console.log('Claude response:', responseData);

    // Parse Claude's response to extract the JSON
    if (!responseData.content || !responseData.content[0] || !responseData.content[0].text) {
      throw new Error('Invalid or empty response from Claude API');
    }
    
    const content = responseData.content[0].text;
    console.log('Raw content from Claude:', content);

    // Clean up and extract JSON more robustly
    let actionData;
    try {
      // Look for JSON structure, handling both {} and first valid JSON block
      const jsonMatch = content.match(/({[\s\S]*})/);
      let jsonStr = jsonMatch ? jsonMatch[0] : null;
      
      if (!jsonStr) {
        throw new Error('Could not find JSON object in Claude response');
      }
      
      // Pre-process the JSON string to fix common issues
      jsonStr = sanitizeJsonString(jsonStr);
      console.log('Sanitized JSON string:', jsonStr);
      
      try {
        // Parse the sanitized JSON
        actionData = JSON.parse(jsonStr);
        console.log('Successfully parsed action data:', actionData);
      } catch (parseError) {
        console.error('Error parsing sanitized JSON:', parseError);
        
        // Try a more aggressive approach to extract valid JSON
        console.log('Attempting more aggressive JSON extraction...');
        
        // Try to extract just the steps array if it exists
        const stepsMatch = jsonStr.match(/"steps"\s*:\s*\[([\s\S]*?)\]/);
        if (stepsMatch) {
          try {
            // Try to parse just the steps array
            const stepsArrayStr = '[' + stepsMatch[1] + ']';
            const stepsArray = JSON.parse(stepsArrayStr);
            console.log('Successfully extracted steps array:', stepsArray);
            
            // Create a minimal valid action data object
            actionData = {
              steps: stepsArray,
              overallExplanation: "Extracted from malformed JSON"
            };
          } catch (stepsError) {
            console.error('Failed to extract steps array:', stepsError);
            throw parseError; // Re-throw the original error if we can't recover
          }
        } else {
          // If we can't extract steps, try to find any valid JSON objects in the response
          const possibleObjects = content.match(/({[^{}]*})/g);
          if (possibleObjects && possibleObjects.length > 0) {
            console.log('Found possible JSON objects:', possibleObjects);
            
            // Try each possible object
            for (const objStr of possibleObjects) {
              try {
                const obj = JSON.parse(objStr);
                if (obj.action || obj.coordinates || obj.text) {
                  // This looks like a step object
                  actionData = {
                    steps: [obj],
                    overallExplanation: "Recovered from malformed JSON"
                  };
                  console.log('Recovered step object:', obj);
                  break;
                }
              } catch (e) {
                // Continue to the next object
              }
            }
          }
          
          // If we still don't have action data, throw the original error
          if (!actionData) {
            throw parseError;
          }
        }
      }
    } catch (jsonError) {
      console.error('Error parsing JSON:', jsonError);
      console.error('Content that caused the error:', content);
      
      // Try to extract any action information from the text response
      const actionMatch = content.match(/action['":\s]+(click|type|extract|navigate|scroll)/i);
      const coordinatesMatch = content.match(/coordinates['":\s]+.*?x['":\s]+(\d+).*?y['":\s]+(\d+)/is);
      const textMatch = content.match(/text['":\s]+"([^"]+)"/i);
      const explanationMatch = content.match(/explanation['":\s]+"([^"]+)"/i);
      
      if (actionMatch && coordinatesMatch) {
        // We can construct a minimal action object
        console.log('Constructing action from regex matches');
        actionData = {
          steps: [{
            action: actionMatch[1].toLowerCase(),
            coordinates: {
              x: parseInt(coordinatesMatch[1], 10),
              y: parseInt(coordinatesMatch[2], 10)
            },
            text: textMatch ? textMatch[1] : undefined,
            explanation: explanationMatch ? explanationMatch[1] : `Perform ${actionMatch[1]} action`
          }],
          overallExplanation: "Constructed from text response"
        };
        console.log('Constructed action data:', actionData);
      } else {
        throw new Error(`Failed to parse JSON from Claude: ${jsonError.message}. Please try again with a simpler command.`);
      }
    }

    if (!actionData) {
      throw new Error('Could not parse action data from Claude response');
    }

    // Convert single-action responses to the multi-step format if needed
    if (!actionData.steps && actionData.action) {
      actionData = {
        steps: [actionData],
        overallExplanation: actionData.explanation || "Executing single action"
      };
    }

    // Execute each step in sequence
    const results = [];
    for (let i = 0; i < actionData.steps.length; i++) {
      const step = actionData.steps[i];
      console.log(`Executing step ${i+1}/${actionData.steps.length}:`, step);
      
      // Execute the action in the browser if needed
      if (step.action !== 'none' && tabId) {
        try {
          // Execute the step
          const result = await executeActionInBrowser(step, tabId);
          results.push({
            step: i+1,
            action: step,
            result: result,
            success: true
          });
          
          // If this is a navigation action, wait for the page to load before continuing
          if (step.action === 'navigate') {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for navigation
            
            // Capture a new screenshot for the next step if needed
            if (i < actionData.steps.length - 1) {
              const newScreenshot = await captureScreenshot(tabId);
              if (newScreenshot) {
                screenshot = newScreenshot;
                
                // If there are more steps, get updated instructions based on new screenshot
                if (i < actionData.steps.length - 1) {
                  try {
                    const updatedSteps = await getUpdatedSteps(
                      command, 
                      screenshot, 
                      actionData.steps.slice(i+1), 
                      `I've completed step ${i+1}: ${step.explanation}. Now continue with the remaining steps.`
                    );
                    if (updatedSteps && updatedSteps.steps && updatedSteps.steps.length > 0) {
                      // Replace remaining steps with updated ones
                      actionData.steps.splice(i+1, actionData.steps.length - (i+1), ...updatedSteps.steps);
                    }
                  } catch (updateError) {
                    console.error('Error getting updated steps:', updateError);
                    // Continue with the original steps if we can't get updated ones
                  }
                }
              }
            }
          }
          
          // Small delay between steps to avoid overwhelming the page
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error(`Error executing step ${i+1}:`, error);
          results.push({
            step: i+1,
            action: step,
            error: error.message,
            success: false
          });
          // Continue with next step even if current one fails
        }
      } else {
        results.push({
          step: i+1,
          action: step,
          result: "No action needed",
          success: true
        });
      }
    }
    
    // Return the combined results of all steps
    return {
      steps: actionData.steps,
      results: results,
      overallExplanation: actionData.overallExplanation,
      completedSteps: results.filter(r => r.success).length,
      totalSteps: actionData.steps.length
    };
    
  } catch (error) {
    console.error('Error processing command with Claude:', error);
    throw error;
  }
}

// Function to execute a single action in the browser
async function executeActionInBrowser(actionData, tabId) {
  return new Promise((resolve, reject) => {
    try {
      // For type actions, ensure we have coordinates
      if (actionData.action === 'type' && !actionData.coordinates && actionData.text) {
        console.log('Type action missing coordinates, will use last clicked coordinates from content script');
      }
      
      // Inject the action data into the content script
      chrome.tabs.sendMessage(tabId, {
        type: 'executeAction',
        actionData
      }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response?.result || { success: true });
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Function to capture a screenshot of a tab
async function captureScreenshot(tabId) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, dataUrl => {
        if (chrome.runtime.lastError) {
          console.error('Error capturing screenshot:', chrome.runtime.lastError);
          resolve(null); // Resolve with null instead of rejecting to continue the flow
        } else {
          resolve(dataUrl);
        }
      });
    } catch (error) {
      console.error('Error in captureScreenshot:', error);
      resolve(null); // Resolve with null instead of rejecting to continue the flow
    }
  });
}

// Helper function to sanitize JSON string
function sanitizeJsonString(jsonStr) {
  console.log('Original JSON string before sanitization:', jsonStr);
  
  try {
    // First attempt to parse as-is (in case it's already valid)
    JSON.parse(jsonStr);
    console.log('JSON is already valid, no sanitization needed');
    return jsonStr;
  } catch (e) {
    console.log('JSON is invalid, attempting to sanitize. Error:', e.message);
    
    // Remove any markdown code block markers
    let sanitized = jsonStr.replace(/```json|```/g, '');
    
    // Replace single quotes with double quotes for property names and string values
    // This regex handles unquoted or single-quoted property names
    sanitized = sanitized.replace(/(['"]?)(\w+)(['"]?)\s*:/g, '"$2":');
    
    // Replace single-quoted string values with double-quoted string values
    sanitized = sanitized.replace(/:\s*'([^']*)'/g, ':"$1"');
    
    // Fix coordinates that might be strings with spaces
    // Look for patterns like "x": " 123" or "y": " 456" and convert to numbers
    sanitized = sanitized.replace(/"(x|y)":\s*"(\s*\d+)"/g, '"$1": $2');
    
    // Fix trailing commas in arrays and objects
    sanitized = sanitized.replace(/,\s*([\]}])/g, '$1');
    
    // Fix missing commas between properties
    sanitized = sanitized.replace(/}(\s*){/g, '},{');
    sanitized = sanitized.replace(/](\s*)\[/g, '],[');
    sanitized = sanitized.replace(/"(\s*){/g, '",{');
    
    // Fix common issues around position 69 (line 5, column 21)
    // This is often related to the coordinates object formatting
    sanitized = sanitized.replace(/"coordinates"\s*:\s*{([^}]*)}/g, (match) => {
      // Normalize the coordinates object
      return match
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .replace(/,\s*}/g, '}')  // Remove trailing commas
        .replace(/:\s*,/g, ': null,')  // Replace empty values with null
        .replace(/([^,{])\s*"([^"]+)":/g, '$1,"$2":');  // Add missing commas between properties
    });
    
    // Add missing quotes around string values
    sanitized = sanitized.replace(/:\s*([^",{\[\]}\d][^",{\[\]}]*?)(\s*[,}])/g, ':"$1"$2');
    
    // Fix potential issues with the "steps" array
    sanitized = sanitized.replace(/"steps"\s*:\s*\[\s*{/g, '"steps":[{');
    sanitized = sanitized.replace(/}\s*,\s*{/g, '},{');
    
    // Fix potential issues with the "action" property
    sanitized = sanitized.replace(/"action"\s*:\s*([^",}\s]+)/g, '"action":"$1"');
    
    // Fix potential issues with the "explanation" property
    sanitized = sanitized.replace(/"explanation"\s*:\s*([^",}\[\]]+)([,}])/g, '"explanation":"$1"$2');
    
    console.log('Sanitized JSON string:', sanitized);
    
    // Verify the sanitized JSON is valid
    try {
      JSON.parse(sanitized);
      console.log('Sanitization successful, JSON is now valid');
    } catch (e) {
      console.error('Sanitization failed, JSON is still invalid. Error:', e.message);
      // Last resort: try to extract just the steps array if it exists
      const stepsMatch = sanitized.match(/"steps"\s*:\s*\[([\s\S]*?)\]/);
      if (stepsMatch) {
        try {
          const stepsArray = JSON.parse('[' + stepsMatch[1] + ']');
          console.log('Extracted steps array as fallback:', stepsArray);
          return JSON.stringify({ steps: stepsArray, overallExplanation: "Extracted from malformed JSON" });
        } catch (e2) {
          console.error('Failed to extract steps array:', e2.message);
        }
      }
    }
    
    return sanitized;
  }
}

// Function to get updated steps based on new screenshot
async function getUpdatedSteps(originalCommand, newScreenshot, remainingSteps, contextPrompt) {
  // Prepare the Claude API request payload
  const requestBody = {
    model: 'claude-3-7-sonnet-20250219',
    max_tokens: 10000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${contextPrompt} Original command: "${originalCommand}"
                   Based on this new screenshot, provide updated steps to complete the remaining parts of this command.
                   The previous planned remaining steps were: ${JSON.stringify(remainingSteps)}
                   
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
                     ]
                   }
                   
                   CRITICAL JSON FORMATTING RULES - FOLLOW THESE EXACTLY:
                   1. Use DOUBLE QUOTES for ALL property names: "action", "coordinates", etc.
                   2. Use DOUBLE QUOTES for ALL string values: "click", "type", etc.
                   3. DO NOT use single quotes anywhere in the JSON
                   4. Ensure the JSON is properly formatted with no trailing commas
                   5. Do not include any text, explanation, or markdown before or after the JSON object
                   6. Make sure all objects have proper opening and closing braces
                   7. Make sure all arrays have proper opening and closing brackets
                   8. Make sure all property/value pairs are separated by commas
                   9. Make sure the last property in an object does NOT have a trailing comma
                   10. Verify your JSON is valid before returning it
                   
                   IMPORTANT COORDINATE GUIDELINES:
                   1. For "click" and "type" actions, provide PRECISE coordinates of the CENTER of the element
                   2. For search buttons, look carefully at the page and identify the exact location
                   3. Coordinates must be numbers (not strings) - e.g., "x": 150, not "x": "150"
                   4. If you're unsure about exact coordinates, provide your best estimate
                   
                   IMPORTANT: For "type" actions, always include both "text" AND "coordinates" fields.
                   The coordinates should match the location of the input field where text should be typed.`
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: newScreenshot.split(',')[1] // Remove "data:image/png;base64," prefix
            }
          }
        ]
      }
    ]
  };

  try {
    console.log('Making API request to get updated steps...');
    
    // Make the API request to Claude
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(requestBody),
      // Add timeout to prevent hanging requests
      signal: createTimeoutSignal(30000) // 30 second timeout
    }).catch(error => {
      console.error('Fetch error in getUpdatedSteps:', error);
      throw new Error(`Network error: ${error.message}`);
    });

    if (!response.ok) {
      let errorMessage = `HTTP error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = `Claude API error: ${errorData.error?.message || response.statusText}`;
      } catch (e) {
        // If we can't parse the error as JSON, use the response text if available
        try {
          const errorText = await response.text();
          errorMessage = `Error: ${errorText || response.statusText}`;
        } catch (textError) {
          // If we can't get the response text either, just use the status
          console.error('Error getting response text:', textError);
        }
      }
      throw new Error(errorMessage);
    }

    const responseData = await response.json().catch(error => {
      console.error('Error parsing JSON response:', error);
      throw new Error('Failed to parse response from Claude API');
    });
    
    console.log('Updated steps response:', responseData);

    // Parse Claude's response to extract the JSON
    if (!responseData.content || !responseData.content[0] || !responseData.content[0].text) {
      throw new Error('Invalid or empty response from Claude API');
    }
    
    const content = responseData.content[0].text;
    console.log('Raw content from update steps Claude response:', content);
    
    // Clean up and extract JSON more robustly
    let updatedSteps;
    try {
      // Look for JSON structure, handling both {} and first valid JSON block
      const jsonMatch = content.match(/({[\s\S]*})/);
      let jsonStr = jsonMatch ? jsonMatch[0] : null;
      
      if (!jsonStr) {
        throw new Error('Could not find JSON object in Claude response');
      }
      
      // Pre-process the JSON string to fix common issues
      jsonStr = sanitizeJsonString(jsonStr);
      console.log('Sanitized JSON string for updated steps:', jsonStr);
      
      // Parse the sanitized JSON
      updatedSteps = JSON.parse(jsonStr);
      console.log('Successfully parsed updated steps:', updatedSteps);
    } catch (jsonError) {
      console.error('Error parsing updated steps JSON:', jsonError);
      console.error('Content that caused the error:', content);
      // Instead of throwing, return null to use original steps
      return null;
    }
    
    if (!updatedSteps || !updatedSteps.steps) {
      console.error('Could not parse steps from Claude response');
      return null;
    }
    
    return updatedSteps;
  } catch (error) {
    console.error('Error getting updated steps:', error);
    // Return null instead of throwing to allow the process to continue with original steps
    return null;
  }
} 
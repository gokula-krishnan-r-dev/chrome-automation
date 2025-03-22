// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  // Get elements from the DOM
  const apiKeyInput = document.getElementById('api-key');
  const saveApiKeyButton = document.getElementById('save-api-key');
  const apiKeyStatus = document.getElementById('api-key-status');
  const commandInput = document.getElementById('command');
  const executeCommandButton = document.getElementById('execute-command');
  const commandStatus = document.getElementById('command-status');
  const resultSection = document.getElementById('result-section');
  const resultContent = document.getElementById('result-content');
  
  // Load saved API key from storage
  chrome.storage.local.get(['claudeApiKey'], function(result) {
    if (result.claudeApiKey) {
      // Only show first few chars and the rest as asterisks for security
      const maskedKey = result.claudeApiKey.substring(0, 10) + '•••••••••••••••';
      apiKeyInput.value = result.claudeApiKey;
      apiKeyStatus.textContent = 'API key loaded';
      apiKeyStatus.className = 'status-message success';
    }
  });
  
  // Save API key
  saveApiKeyButton.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      apiKeyStatus.textContent = 'Please enter a valid API key';
      apiKeyStatus.className = 'status-message error';
      return;
    }
    
    // Basic validation for Anthropic API keys
    if (!apiKey.startsWith('sk-ant-')) {
      apiKeyStatus.textContent = 'Invalid API key format. Claude keys should start with "sk-ant-"';
      apiKeyStatus.className = 'status-message error';
      return;
    }
    
    // Send message to background script
    chrome.runtime.sendMessage({
      type: 'saveApiKey',
      apiKey: apiKey
    }, function(response) {
      if (response && response.success) {
        apiKeyStatus.textContent = 'API key saved successfully';
        apiKeyStatus.className = 'status-message success';
      } else {
        apiKeyStatus.textContent = 'Failed to save API key';
        apiKeyStatus.className = 'status-message error';
      }
    });
  });
  
  // Execute command
  executeCommandButton.addEventListener('click', async function() {
    const command = commandInput.value.trim();
    
    if (!command) {
      commandStatus.textContent = 'Please enter a command';
      commandStatus.className = 'status-message error';
      return;
    }
    
    // Check if API key is set
    chrome.storage.local.get(['claudeApiKey'], async function(result) {
      if (!result.claudeApiKey) {
        commandStatus.textContent = 'Please set your Claude API key first';
        commandStatus.className = 'status-message error';
        return;
      }
      
      // Continue with execution if API key is set
      try {
        // Update UI to show processing
        executeCommandButton.disabled = true;
        commandStatus.textContent = 'Processing command...';
        commandStatus.className = 'status-message';
        resultSection.className = 'result-section hidden';
        
        // Get the current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
          throw new Error('No active tab found');
        }
        
        // Capture screenshot using the chrome tabs API
        const screenshot = await captureScreenshot(tab.id);
        
        // Send the command and screenshot to the background script
        chrome.runtime.sendMessage({
          type: 'executeCommand',
          command: command,
          screenshot: screenshot,
          tabId: tab.id
        }, function(response) {
          // Re-enable the execute button
          executeCommandButton.disabled = false;
          
          if (response && response.error) {
            // Display error
            commandStatus.textContent = `Error: ${response.error}`;
            commandStatus.className = 'status-message error';
          } else if (response && response.success) {
            // Display success and results
            const completedSteps = response.response.completedSteps || 0;
            const totalSteps = response.response.totalSteps || 1;
            
            commandStatus.textContent = `Command executed successfully (${completedSteps}/${totalSteps} steps completed)`;
            commandStatus.className = 'status-message success';
            
            // Show the result section with the data
            resultSection.className = 'result-section';
            
            // Format the results in a more readable way
            let formattedResults = `<strong>Overall Plan:</strong> ${response.response.overallExplanation || ''}<br><br>`;
            
            if (response.response.steps && response.response.steps.length > 0) {
              formattedResults += `<strong>Steps Executed:</strong><br>`;
              
              response.response.steps.forEach((step, index) => {
                const stepResult = response.response.results && response.response.results[index];
                const stepStatus = stepResult ? (stepResult.success ? '✅' : '❌') : '⚠️';
                
                formattedResults += `<div style="margin-bottom: 10px; padding: 5px; border-left: 3px solid #ccc;">
                  <strong>Step ${index + 1}:</strong> ${stepStatus} ${step.explanation || ''}<br>
                  <code>${JSON.stringify(step, null, 2)}</code>
                  ${stepResult && stepResult.error ? `<br><span style="color: #D32F2F;">Error: ${stepResult.error}</span>` : ''}
                </div>`;
              });
            }
            
            resultContent.innerHTML = formattedResults;
          } else {
            // Unknown response
            commandStatus.textContent = 'Received unknown response';
            commandStatus.className = 'status-message error';
          }
        });
      } catch (error) {
        // Re-enable the execute button
        executeCommandButton.disabled = false;
        
        // Display error
        commandStatus.textContent = `Error: ${error.message}`;
        commandStatus.className = 'status-message error';
      }
    });
  });
});

// Function to capture a screenshot of the current tab
async function captureScreenshot(tabId) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, dataUrl => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!dataUrl) {
          reject(new Error('Failed to capture screenshot (empty result)'));
        } else {
          resolve(dataUrl);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
} 
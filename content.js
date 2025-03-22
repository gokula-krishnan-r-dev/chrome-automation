// Content script that is injected into webpages
console.log('Browser Use content script loaded');

// Store the last executed action and its result
let lastExecutedAction = null;
let lastExecutedResult = null;
// Store coordinates of the last clicked element to use for typing if needed
let lastClickedCoordinates = null;
// Store the last element that was interacted with
let lastInteractedElement = null;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.type === 'captureScreenshot') {
    // Note: We can't directly capture screenshots from content scripts
    // This will be handled by the popup.js using chrome.tabs.captureVisibleTab
    sendResponse({ success: false, error: 'Screenshot capture should be handled by the background script' });
    return true;
  }
  
  if (message.type === 'executeAction') {
    const { actionData } = message;
    
    // Store this action as the last executed one
    lastExecutedAction = actionData;
    
    executeAction(actionData)
      .then(result => {
        // Store the result
        lastExecutedResult = result;
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('Error executing action:', error);
        lastExecutedResult = { error: error.message, success: false };
        sendResponse({ error: error.message });
      });
    return true; // Required for async sendResponse
  }
  
  if (message.type === 'getLastExecutedAction') {
    sendResponse({ 
      action: lastExecutedAction, 
      result: lastExecutedResult,
      lastClickedCoordinates: lastClickedCoordinates 
    });
    return true;
  }
});

// Function to execute actions on the webpage
async function executeAction(actionData) {
  console.log('Executing action:', actionData);
  const { action, coordinates, text, url, scrollDirection, scrollAmount } = actionData;
  
  try {
    switch (action) {
      case 'click':
        if (coordinates) {
          // Clean up coordinates if they're strings with spaces
          const x = typeof coordinates.x === 'string' ? parseInt(coordinates.x.trim(), 10) : coordinates.x;
          const y = typeof coordinates.y === 'string' ? parseInt(coordinates.y.trim(), 10) : coordinates.y;
          
          console.log(`Attempting to click at cleaned coordinates (${x}, ${y})`);
          
          // Try to find the element at the specified coordinates
          let element = document.elementFromPoint(x, y);
          
          // If no element found, try to find a clickable element nearby
          if (!element) {
            console.log('No element found at exact coordinates, searching nearby...');
            element = findNearbyClickableElement(x, y, 50); // Search within 50px radius
          }
          
          if (element) {
            // Store these coordinates and element for potential future typing actions
            lastClickedCoordinates = { x, y };
            lastInteractedElement = element;
            
            // Log information about the element being clicked
            console.log('Clicking element:', {
              tagName: element.tagName,
              id: element.id,
              className: element.className,
              text: element.innerText || element.textContent
            });
            
            // Highlight the element briefly before clicking
            const originalOutline = element.style.outline;
            element.style.outline = '2px solid red';
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Click the element
            element.click();
            
            // Restore original outline after a short delay
            setTimeout(() => {
              element.style.outline = originalOutline;
            }, 500);
            
            return { 
              success: true, 
              message: `Clicked element at (${x}, ${y})`,
              elementInfo: {
                tagName: element.tagName,
                id: element.id,
                className: element.className,
                text: (element.innerText || element.textContent || '').substring(0, 50)
              }
            };
          } else {
            // If we still can't find an element, try to find any button with "search" text
            if (actionData.explanation && 
                (actionData.explanation.toLowerCase().includes('search') || 
                 actionData.explanation.toLowerCase().includes('submit'))) {
              console.log('Looking for search/submit button as fallback...');
              const searchButton = findSearchButton();
              
              if (searchButton) {
                console.log('Found search button as fallback:', searchButton);
                
                // Highlight and click the search button
                const originalOutline = searchButton.style.outline;
                searchButton.style.outline = '2px solid orange';
                await new Promise(resolve => setTimeout(resolve, 300));
                
                searchButton.click();
                
                setTimeout(() => {
                  searchButton.style.outline = originalOutline;
                }, 500);
                
                return {
                  success: true,
                  message: 'Clicked search button using fallback method',
                  elementInfo: {
                    tagName: searchButton.tagName,
                    id: searchButton.id,
                    className: searchButton.className,
                    text: (searchButton.innerText || searchButton.textContent || '').substring(0, 50)
                  }
                };
              }
            }
            
            throw new Error(`No element found at coordinates (${x}, ${y})`);
          }
        } else {
          throw new Error('No coordinates provided for click action');
        }
      
      case 'type':
        // Clean up coordinates if they're strings with spaces
        const typeCoordinates = coordinates ? {
          x: typeof coordinates.x === 'string' ? parseInt(coordinates.x.trim(), 10) : coordinates.x,
          y: typeof coordinates.y === 'string' ? parseInt(coordinates.y.trim(), 10) : coordinates.y
        } : lastClickedCoordinates;
        
        if (!text) {
          throw new Error('No text provided for type action');
        }
        
        if (!typeCoordinates) {
          throw new Error('No coordinates available for type action - please click on an input field first');
        }
        
        console.log(`Attempting to type "${text}" at coordinates (${typeCoordinates.x}, ${typeCoordinates.y})`);
        
        // Find the target element using coordinates
        let element = document.elementFromPoint(typeCoordinates.x, typeCoordinates.y);
        
        // If no element found at exact coordinates, try to find nearby input
        if (!element) {
          console.log('No element found at exact coordinates for typing, searching nearby...');
          element = findNearbyInputElement(typeCoordinates.x, typeCoordinates.y, 50);
        }
        
        if (!element) {
          throw new Error(`No element found at coordinates (${typeCoordinates.x}, ${typeCoordinates.y})`);
        }
        
        console.log('Found element for typing:', {
          tagName: element.tagName,
          id: element.id,
          className: element.className,
          type: element.type,
          role: element.getAttribute('role'),
          ariaLabel: element.getAttribute('aria-label')
        });
        
        // Special handling for travel site inputs - they often have more complex structure
        // Check if we're on a travel booking site
        const isTravelSite = window.location.href.includes('priceline') || 
                            window.location.href.includes('expedia') || 
                            window.location.href.includes('booking') ||
                            window.location.href.includes('kayak') ||
                            window.location.href.includes('travelocity');
        
        if (isTravelSite) {
          console.log('Detected travel booking site, using specialized input handling');
          const result = await handleTravelSiteInput(element, text, typeCoordinates);
          if (result.success) {
            return result;
          }
          // If specialized handling failed, continue with regular approach as fallback
          console.log('Specialized input handling failed, trying standard approach');
        }
        
        // Check if this is a typeable element
        const isInput = element.tagName === 'INPUT';
        const isTextarea = element.tagName === 'TEXTAREA';
        const isContentEditable = element.isContentEditable;
        
        // If the element isn't directly typeable, try to find a suitable input
        if (!(isInput || isTextarea || isContentEditable)) {
          // Look for input elements inside or near the clicked element
          const inputElement = findInputElement(element);
          
          if (inputElement) {
            // Use this input element instead
            console.log('Found input element near clicked element, using it instead:', {
              tagName: inputElement.tagName,
              id: inputElement.id,
              className: inputElement.className,
              type: inputElement.type
            });
            lastInteractedElement = inputElement;
            
            // Update the UI to show what we're typing into
            const originalOutline = inputElement.style.outline;
            inputElement.style.outline = '2px solid blue';
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Focus on the input element
            inputElement.focus();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Try multiple input methods in sequence
            const inputMethods = [
              // Method 1: Set value and dispatch events
              async () => {
                console.log('Trying input method 1: Direct value setting');
                // Clear existing value
                inputElement.value = '';
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // Set the value directly
                inputElement.value = text;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                return inputElement.value === text;
              },
              
              // Method 2: Use insertText command
              async () => {
                console.log('Trying input method 2: execCommand insertText');
                inputElement.focus();
                inputElement.select(); // Select all existing text
                document.execCommand('insertText', false, text);
                return inputElement.value === text;
              },
              
              // Method 3: Simulate individual keystrokes
              async () => {
                console.log('Trying input method 3: Simulated keystrokes');
                inputElement.focus();
                inputElement.value = '';
                await simulateTyping(inputElement, text);
                return inputElement.value === text;
              },
              
              // Method 4: Use clipboard paste
              async () => {
                console.log('Trying input method 4: Clipboard paste');
                // Save original clipboard content (when supported)
                let originalClipboardData = undefined;
                try {
                  originalClipboardData = await navigator.clipboard.readText().catch(() => undefined);
                } catch (e) {
                  // Clipboard API not available
                }
                
                // Set clipboard to our text
                try {
                  await navigator.clipboard.writeText(text).catch(() => {
                    console.log('Could not write to clipboard, trying execCommand');
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                  });
                } catch (e) {
                  console.error('Clipboard operation failed:', e);
                  return false;
                }
                
                // Focus and select all text in the input
                inputElement.focus();
                inputElement.select();
                
                // Paste the text
                document.execCommand('paste');
                
                // Restore original clipboard if possible
                if (originalClipboardData !== undefined) {
                  try {
                    await navigator.clipboard.writeText(originalClipboardData).catch(() => {
                      // Ignore errors when restoring clipboard
                    });
                  } catch (e) {
                    // Ignore errors when restoring clipboard
                  }
                }
                
                return inputElement.value === text;
              }
            ];
            
            // Try each method until one works
            let success = false;
            for (const method of inputMethods) {
              if (await method()) {
                success = true;
                break;
              }
              // Short delay before trying next method
              await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            // Trigger Enter key press if on Priceline and text field is filled
            if (window.location.href.includes('priceline') && success) {
              console.log('Priceline detected, sending Enter key to trigger autocomplete selection');
              await new Promise(resolve => setTimeout(resolve, 800));
              
              const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
              });
              
              inputElement.dispatchEvent(enterEvent);
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Also click somewhere else to trigger blur
              const body = document.body;
              if (body) {
                body.click();
              }
            }
            
            // Restore outline
            setTimeout(() => {
              inputElement.style.outline = originalOutline;
            }, 500);
            
            return {
              success: true,
              message: `Typed "${text}" into found input element`,
              elementInfo: {
                tagName: inputElement.tagName,
                id: inputElement.id,
                className: inputElement.className,
                value: inputElement.value
              }
            };
          } else {
            console.warn('No typeable element found, attempting type-anywhere approach');
            
            // Last resort - try to type anywhere by setting document.activeElement
            document.activeElement.blur();
            element.focus();
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Try using document.execCommand to type
            const wasSuccessful = document.execCommand('insertText', false, text);
            
            if (wasSuccessful) {
              return {
                success: true,
                message: `Typed "${text}" using execCommand`,
                elementInfo: {
                  tagName: element.tagName,
                  value: "Content inserted with execCommand"
                }
              };
            } else {
              throw new Error(`No typeable element found at coordinates (${typeCoordinates.x}, ${typeCoordinates.y})`);
            }
          }
        }
        
        // Remember this element for future interactions
        lastInteractedElement = element;
        
        // Highlight the element briefly before typing
        const originalOutline = element.style.outline;
        element.style.outline = '2px solid blue';
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Focus the element first
        element.focus();
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Clear the existing value if it's an input or textarea
        if (isInput || isTextarea) {
          // Store original value for logging
          const originalValue = element.value;
          console.log(`Clearing input. Original value: "${originalValue}"`);
          
          element.value = '';
          // Trigger input event after clearing
          element.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Set the value directly
          console.log(`Setting input value to: "${text}"`);
          element.value = text;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Also try simulating typing to trigger dynamic validation
          await simulateTyping(element, text);
          
          // Verify the value was set properly
          console.log(`Final input value: "${element.value}"`);
          if (!element.value && element.value !== text) {
            console.warn('Input value not set properly, trying alternative approach');
            // Try one more approach with document.execCommand
            element.focus();
            document.execCommand('insertText', false, text);
          }
        } else if (isContentEditable) {
          // Clear contentEditable elements
          console.log('Clearing contentEditable element');
          element.textContent = '';
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Use execCommand for contentEditable elements
          console.log(`Inserting text: "${text}"`);
          document.execCommand('insertText', false, text);
        }
        
        // Restore original outline
        setTimeout(() => {
          element.style.outline = originalOutline;
        }, 500);
        
        return { 
          success: true, 
          message: `Typed "${text}" at (${typeCoordinates.x}, ${typeCoordinates.y})`,
          elementInfo: {
            tagName: element.tagName,
            id: element.id,
            className: element.className,
            value: element.value || element.textContent
          }
        };
      
      case 'extract':
        if (coordinates) {
          const element = document.elementFromPoint(coordinates.x, coordinates.y);
          if (element) {
            // Highlight the element briefly
            const originalOutline = element.style.outline;
            element.style.outline = '2px solid green';
            await new Promise(resolve => setTimeout(resolve, 300));
            
            const extractedText = element.innerText || element.textContent;
            
            // Restore original outline
            setTimeout(() => {
              element.style.outline = originalOutline;
            }, 500);
            
            return { 
              success: true, 
              text: extractedText, 
              message: `Extracted text from element at (${coordinates.x}, ${coordinates.y})`,
              elementInfo: {
                tagName: element.tagName,
                id: element.id,
                className: element.className
              }
            };
          } else {
            throw new Error(`No element found at coordinates (${coordinates.x}, ${coordinates.y})`);
          }
        } else if (text) {
          // Extract based on selector
          try {
            const elements = document.querySelectorAll(text);
            if (elements.length > 0) {
              // Highlight the elements briefly
              const originalOutlines = Array.from(elements).map(el => el.style.outline);
              elements.forEach(el => {
                el.style.outline = '2px solid green';
              });
              await new Promise(resolve => setTimeout(resolve, 300));
              
              const extractedTexts = Array.from(elements).map(el => el.innerText || el.textContent);
              
              // Restore original outlines
              setTimeout(() => {
                elements.forEach((el, i) => {
                  el.style.outline = originalOutlines[i];
                });
              }, 500);
              
              return { 
                success: true, 
                text: extractedTexts, 
                message: `Extracted text from ${elements.length} elements matching selector "${text}"` 
              };
            } else {
              throw new Error(`No elements found matching selector "${text}"`);
            }
          } catch (selectorError) {
            throw new Error(`Invalid selector: ${text}. Error: ${selectorError.message}`);
          }
        } else {
          throw new Error('Missing coordinates or selector for extract action');
        }
      
      case 'navigate':
        if (url) {
          // Note: We're just changing the location, which will unload this content script
          window.location.href = url;
          return { success: true, message: `Navigating to ${url}` };
        } else {
          throw new Error('No URL provided for navigate action');
        }
      
      case 'scroll':
        if (scrollDirection && scrollAmount) {
          let scrollX = 0;
          let scrollY = 0;
          
          switch (scrollDirection) {
            case 'up':
              scrollY = -scrollAmount;
              break;
            case 'down':
              scrollY = scrollAmount;
              break;
            case 'left':
              scrollX = -scrollAmount;
              break;
            case 'right':
              scrollX = scrollAmount;
              break;
          }
          
          // Get current scroll position to return later
          const scrollBefore = {
            x: window.scrollX,
            y: window.scrollY
          };
          
          window.scrollBy(scrollX, scrollY);
          
          // Wait a bit for the scroll to complete
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Get new scroll position
          const scrollAfter = {
            x: window.scrollX,
            y: window.scrollY
          };
          
          return { 
            success: true, 
            message: `Scrolled ${scrollDirection} by ${scrollAmount} pixels`,
            scrollBefore,
            scrollAfter
          };
        } else {
          throw new Error('Missing scroll direction or amount for scroll action');
        }
      
      case 'waitForElement':
        // New action type to wait for an element to appear
        if (text) { // Use the text field for the selector
          const maxWaitTime = actionData.scrollAmount || 5000; // Reuse scrollAmount as wait time or default to 5000ms
          const startTime = Date.now();
          
          try {
            // Repeatedly check for the element
            while (Date.now() - startTime < maxWaitTime) {
              const elements = document.querySelectorAll(text);
              if (elements.length > 0) {
                return {
                  success: true,
                  message: `Found ${elements.length} elements matching selector "${text}" after ${Date.now() - startTime}ms`,
                  timeElapsed: Date.now() - startTime
                };
              }
              // Wait a bit before checking again
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            throw new Error(`Timed out after ${maxWaitTime}ms waiting for element with selector "${text}"`);
          } catch (selectorError) {
            throw new Error(`Invalid selector: ${text}. Error: ${selectorError.message}`);
          }
        } else {
          throw new Error('Missing selector for waitForElement action');
        }
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error executing action:', error);
    throw error;
  }
}

// Helper function to simulate typing character by character
async function simulateTyping(element, text) {
  console.log(`Simulating typing for "${text}"`);
  
  // Focus the element again to be sure
  element.focus();
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Trigger keyboard events for each character
  for (const char of text) {
    // Create and dispatch keyboard events
    const keyDown = new KeyboardEvent('keydown', {
      key: char,
      code: `Key${char.toUpperCase()}`,
      bubbles: true
    });
    const keyPress = new KeyboardEvent('keypress', {
      key: char,
      code: `Key${char.toUpperCase()}`,
      bubbles: true
    });
    const keyUp = new KeyboardEvent('keyup', {
      key: char,
      code: `Key${char.toUpperCase()}`,
      bubbles: true
    });
    
    element.dispatchEvent(keyDown);
    element.dispatchEvent(keyPress);
    element.dispatchEvent(keyUp);
    
    // Small delay between characters
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  
  // Dispatch additional events to ensure the input is recognized
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// Helper function to handle input specifically for travel sites like Priceline
async function handleTravelSiteInput(element, text, coordinates) {
  console.log('Using specialized travel site input handling');
  
  try {
    // First, try to find the actual input element - travel sites often have complex layered UIs
    // where the clickable element isn't the actual input
    let inputElement = null;
    
    // Remove Booking.com specific handling and use a more general approach
    
    // Case 1: Check if the element itself is an input
    if (element.tagName === 'INPUT') {
      inputElement = element;
    } 
    // Case 2: Look for input in the element's children
    else {
      inputElement = element.querySelector('input');
    }
    
    // Case 3: Look for the closest input by walking up and then down the DOM
    if (!inputElement) {
      // Check parents and their children
      let parent = element.parentElement;
      let maxLevelsUp = 3; // Don't go too far up the tree
      
      while (parent && maxLevelsUp > 0) {
        inputElement = parent.querySelector('input');
        if (inputElement) break;
        parent = parent.parentElement;
        maxLevelsUp--;
      }
    }
    
    // Case 4: Look for an input near the coordinates
    if (!inputElement) {
      // Get all inputs on the page
      const allInputs = document.querySelectorAll('input');
      
      // Find the closest input to our coordinates
      let closestDistance = Number.MAX_VALUE;
      
      allInputs.forEach(input => {
        const rect = input.getBoundingClientRect();
        const inputCenterX = rect.left + rect.width / 2;
        const inputCenterY = rect.top + rect.height / 2;
        
        const distance = Math.sqrt(
          Math.pow(inputCenterX - coordinates.x, 2) + 
          Math.pow(inputCenterY - coordinates.y, 2)
        );
        
        if (distance < closestDistance) {
          closestDistance = distance;
          inputElement = input;
        }
      });
      
      // Only use if reasonably close (within 150px)
      if (closestDistance > 150) {
        inputElement = null;
      }
    }
    
    if (!inputElement) {
      console.log('Could not find a suitable input element for travel site');
      return { success: false };
    }
    
    console.log('Found travel site input element:', {
      tagName: inputElement.tagName,
      id: inputElement.id,
      className: inputElement.className,
      type: inputElement.type,
      value: inputElement.value
    });
    
    // Save the original styles to restore later
    const originalOutline = inputElement.style.outline;
    inputElement.style.outline = '2px solid blue';
    
    // Extra click to ensure it's activated
    inputElement.click();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Make sure it's focused
    inputElement.focus();
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Clear any existing value - first try clicking any clear button if present
    const clearButton = findClearButton(inputElement);
    if (clearButton) {
      console.log('Found and clicking clear button');
      clearButton.click();
      await new Promise(resolve => setTimeout(resolve, 300));
    } else {
      // Otherwise clear manually
      inputElement.value = '';
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Try all these methods in sequence
    
    // Method 1: Direct value setting
    console.log('Travel site: Trying direct value setting');
    inputElement.value = text;
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Method 2: Character by character typing with longer delays
    if (!inputElement.value || inputElement.value !== text) {
      console.log('Travel site: Trying character-by-character typing');
      inputElement.value = '';
      inputElement.focus();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Type character by character with longer delays
      for (const char of text) {
        // Try insertText for each character
        document.execCommand('insertText', false, char);
        
        // Also dispatch keyboard events
        const keyDown = new KeyboardEvent('keydown', { key: char, bubbles: true });
        const keyPress = new KeyboardEvent('keypress', { key: char, bubbles: true });
        const keyUp = new KeyboardEvent('keyup', { key: char, bubbles: true });
        
        inputElement.dispatchEvent(keyDown);
        inputElement.dispatchEvent(keyPress);
        inputElement.dispatchEvent(keyUp);
        
        // Dispatch input event after each character
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Longer delay between characters for travel sites
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Final change event
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Check if we successfully set the value
    console.log('Current input value:', inputElement.value);
    
    // Generic approach for all travel sites - try to trigger autocomplete with Down and Enter
    // This works on many travel sites including Booking.com, Priceline, Expedia, etc.
    console.log('Sending Down and Enter keys to select autocomplete option');
    
    // First press down to select the first autocomplete option
    const downEvent = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      keyCode: 40,
      which: 40,
      bubbles: true
    });
    
    inputElement.dispatchEvent(downEvent);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Then press Enter to select it
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true
    });
    
    inputElement.dispatchEvent(enterEvent);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Click outside the input to finalize
    document.body.click();
    
    // Restore original styles
    inputElement.style.outline = originalOutline;
    
    return {
      success: true,
      message: `Typed "${text}" into travel site input`,
      elementInfo: {
        tagName: inputElement.tagName,
        id: inputElement.id,
        className: inputElement.className,
        value: inputElement.value
      }
    };
    
  } catch (error) {
    console.error('Travel site input handling error:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to find an input element related to the clicked element
function findInputElement(element) {
  // Case 1: Check if element itself is an input-like element
  if (element.tagName === 'INPUT' || 
      element.tagName === 'TEXTAREA' || 
      element.isContentEditable ||
      element.getAttribute('role') === 'textbox') {
    return element;
  }
  
  // Case 2: Look for input elements inside the clicked element
  const inputInside = element.querySelector('input, textarea, [contenteditable="true"], [role="textbox"]');
  if (inputInside) {
    return inputInside;
  }
  
  // Case 3: Look for associated input by aria attributes
  const ariaControls = element.getAttribute('aria-controls');
  if (ariaControls) {
    const controlledElement = document.getElementById(ariaControls);
    if (controlledElement && (controlledElement.tagName === 'INPUT' || controlledElement.tagName === 'TEXTAREA')) {
      return controlledElement;
    }
  }
  
  // Case 4: Look for inputs in parent container
  let parent = element.parentElement;
  let searchDepth = 3; // Don't go too far up the tree
  
  while (parent && searchDepth > 0) {
    const inputNearby = parent.querySelector('input, textarea, [contenteditable="true"], [role="textbox"]');
    if (inputNearby) {
      return inputNearby;
    }
    parent = parent.parentElement;
    searchDepth--;
  }
  
  // Case 5: Look for labels that might be associated with inputs
  if (element.tagName === 'LABEL' && element.htmlFor) {
    const associatedInput = document.getElementById(element.htmlFor);
    if (associatedInput) {
      return associatedInput;
    }
  }
  
  // No suitable input found
  return null;
}

// Helper function to find a clear button near an input
function findClearButton(inputElement) {
  // Look for elements that might be clear buttons
  const possibleClearButtons = [];
  
  // Check siblings and parent's children
  let parent = inputElement.parentElement;
  if (parent) {
    // Look for elements with common clear button characteristics
    Array.from(parent.children).forEach(el => {
      // Skip the input element itself
      if (el === inputElement) return;
      
      const text = (el.innerText || el.textContent || '').toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const className = (el.className || '').toLowerCase();
      
      // Check for common clear button indicators
      if (
        text.includes('clear') || text.includes('×') || text === 'x' ||
        ariaLabel.includes('clear') || ariaLabel.includes('remove') ||
        className.includes('clear') || className.includes('close') || className.includes('remove') ||
        el.innerHTML.includes('&times;') || el.innerHTML.includes('✕') || el.innerHTML.includes('✖')
      ) {
        possibleClearButtons.push(el);
      }
    });
  }
  
  // Return the first found clear button, if any
  return possibleClearButtons.length > 0 ? possibleClearButtons[0] : null;
}

// Helper function to find a clickable element near the specified coordinates
function findNearbyClickableElement(x, y, radius) {
  console.log(`Searching for clickable elements within ${radius}px of (${x}, ${y})`);
  
  // Get all potentially clickable elements
  const clickableElements = Array.from(document.querySelectorAll(
    'button, [role="button"], a, input[type="submit"], input[type="button"], [class*="btn"], [class*="button"], [aria-label*="search"], [aria-label*="submit"]'
  ));
  
  // Add elements with click-related classes or IDs
  const clickClassElements = Array.from(document.querySelectorAll(
    '[class*="click"], [id*="click"], [class*="submit"], [id*="submit"], [class*="search"], [id*="search"]'
  ));
  
  // Combine and remove duplicates
  const allClickable = [...new Set([...clickableElements, ...clickClassElements])];
  
  // Find the closest element within the radius
  let closestElement = null;
  let closestDistance = radius;
  
  allClickable.forEach(element => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const distance = Math.sqrt(
      Math.pow(centerX - x, 2) + 
      Math.pow(centerY - y, 2)
    );
    
    if (distance < closestDistance) {
      closestDistance = distance;
      closestElement = element;
    }
  });
  
  if (closestElement) {
    console.log(`Found clickable element at distance ${closestDistance}px:`, {
      tagName: closestElement.tagName,
      id: closestElement.id,
      className: closestElement.className,
      text: closestElement.innerText || closestElement.textContent
    });
  }
  
  return closestElement;
}

// Helper function to find a search button on the page
function findSearchButton() {
  // Try multiple selectors to find search buttons
  const selectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button.search-button',
    'button.submit-button',
    'button[aria-label*="search" i]',
    'button[aria-label*="submit" i]',
    'button:not([disabled])',
    '[role="button"]'
  ];
  
  // Try each selector
  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector));
    
    // Filter elements that look like search buttons
    const searchButtons = elements.filter(el => {
      const text = (el.innerText || el.textContent || '').toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const className = (el.className || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      
      return (
        text.includes('search') || 
        text.includes('submit') || 
        text.includes('find') ||
        ariaLabel.includes('search') || 
        ariaLabel.includes('submit') ||
        className.includes('search') || 
        className.includes('submit') ||
        id.includes('search') || 
        id.includes('submit')
      );
    });
    
    if (searchButtons.length > 0) {
      // Return the first matching button
      return searchButtons[0];
    }
  }
  
  // If no search button found with text, try to find any button in the form
  const forms = document.querySelectorAll('form');
  for (const form of forms) {
    const buttons = form.querySelectorAll('button, input[type="submit"]');
    if (buttons.length > 0) {
      return buttons[buttons.length - 1]; // Usually the last button in a form is the submit button
    }
  }
  
  // Last resort: look for any visible button at the bottom of a form-like container
  const formLike = document.querySelectorAll('.form, [class*="form"], [class*="search-container"]');
  for (const container of formLike) {
    const buttons = container.querySelectorAll('button, [role="button"]');
    if (buttons.length > 0) {
      return buttons[buttons.length - 1];
    }
  }
  
  return null;
}

// Helper function to find an input element near the specified coordinates
function findNearbyInputElement(x, y, radius) {
  console.log(`Searching for input elements within ${radius}px of (${x}, ${y})`);
  
  // Get all input elements
  const inputElements = Array.from(document.querySelectorAll(
    'input, textarea, [contenteditable="true"], [role="textbox"], [role="combobox"]'
  ));
  
  // Find the closest element within the radius
  let closestElement = null;
  let closestDistance = radius;
  
  inputElements.forEach(element => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const distance = Math.sqrt(
      Math.pow(centerX - x, 2) + 
      Math.pow(centerY - y, 2)
    );
    
    if (distance < closestDistance) {
      closestDistance = distance;
      closestElement = element;
    }
  });
  
  if (closestElement) {
    console.log(`Found input element at distance ${closestDistance}px:`, {
      tagName: closestElement.tagName,
      id: closestElement.id,
      className: closestElement.className,
      type: closestElement.type
    });
  }
  
  return closestElement;
}

// Notify the background script that the content script is ready
chrome.runtime.sendMessage({ type: 'contentScriptReady' }); 
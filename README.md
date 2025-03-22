# Browser Use with Claude AI-Assisted Error Recovery

This Chrome extension allows you to control your browser using natural language commands interpreted by Claude AI. It breaks down complex commands into a series of executable steps and features an intelligent error recovery system that automatically attempts alternative approaches when steps fail.

## Features

- **Natural Language Browser Control**: Issue commands like "Go to priceline.com and search for flights from Las Vegas to San Francisco" in plain English
- **AI-Powered Command Parsing**: Claude AI analyzes your commands and breaks them down into executable steps
- **Automatic Error Recovery**: When a step fails, the system takes a screenshot, sends it to Claude, and gets alternative approaches
- **Multiple Retry Strategies**: Up to 3 different approaches are tried for each failed step
- **Detailed Logging**: All actions and their results are logged for transparency
- **Visual Execution Tracking**: Watch as each step is executed with clear visual indicators
- **Robust Failure Handling**: Even if some steps fail, the system continues executing subsequent steps

## How It Works

1. You enter a natural language command in the extension
2. The command is sent to Claude AI along with a screenshot of the current page
3. Claude breaks down the command into a series of steps with precise coordinates and actions
4. The extension executes each step in sequence
5. If a step fails, the system:
   - Takes a new screenshot
   - Sends it to Claude with information about the failure
   - Gets an alternative approach
   - Tries the new approach
   - Repeats up to 3 times with different strategies
6. The extension shows detailed logs and execution results

## Usage Examples

- **Web Navigation**: "Go to google.com, search for Claude AI, and click on the first result"
- **Form Filling**: "Go to priceline.com, search for flights from Las Vegas to San Francisco for next weekend"
- **Data Extraction**: "Go to weather.com and tell me the forecast for New York City"
- **Multi-step Workflows**: "Log into my Gmail account, find emails from Amazon, and mark them as read"

## Intelligent Fallback Strategies

When a step fails, the system uses several strategies to recover:

1. **Coordinate Adjustment**: Tries clicking/typing at slightly different coordinates
2. **Element Identification**: Uses alternative ways to find and interact with elements
3. **Workflow Modification**: May suggest a completely different approach to accomplish the same goal
4. **Visual Analysis**: Analyzes the screenshot to understand what's visible and clickable

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the extension directory
5. Click the extension icon to use the side panel interface

## Configuration

You'll need a Claude API key to use this extension:

1. Get a Claude API key from [anthropic.com](https://anthropic.com)
2. Enter the API key in the extension settings
3. Save the key (it's stored locally in your browser)

## Permissions

This extension requires:

- Access to browse data on sites you visit (to interact with web pages)
- Access to your tabs and browsing activity (to capture screenshots and execute commands)
- Storage permission (to save your API key)

## Privacy

- Your API key is stored locally in your browser
- Screenshots are only sent to Claude AI for command processing
- No data is stored on any server beyond what's needed for Claude API interactions

## License

[MIT License](LICENSE)

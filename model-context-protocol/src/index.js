/**
 * Pollinations API Client and MCP Server
 *
 * A simple client for the Pollinations APIs that follows the thin proxy design principle.
 * Also includes the MCP server implementation for stdio transport.
 */

// Import MCP server dependencies
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setupAbortControllerPolyfill } from './utils/polyfills.js';
import player from 'play-sound';

// Import tools with their schemas and handlers
import { imageTools } from './services/imageService.js';
import { textTools } from './services/textService.js';
import { audioTools } from './services/audioService.js';
import { resourceTools } from './services/resourceService.js';
import { authTools } from './services/authService.js';

// Export all tools as a flat array
const toolDefinitions = [
  // Image tools
  ...imageTools,

  // Text tools
  ...textTools,

  // Audio tools
  ...audioTools,
  ...authTools,
  // Resource tools
  // ...resourceTools
];

/**
 * Starts the MCP server with STDIO transport
 */
export async function startMcpServer() {
  try {
    // Setup AbortController polyfill for older Node.js versions
    // await setupAbortControllerPolyfill();
    
    try {
      // Initialize audio player for audio tools
      global.audioPlayer = player();
    } catch (error) {
      console.error('Failed to initialize audio player:', error);
    }
    
    // Create the MCP server with tool definitions
    const server = new McpServer({
      name: 'pollinations-mcp',
      version: '1.0.10',
      instructions: `# 🚀 Pollinations MCP Server

## 💫 Available Capabilities
This MCP server provides tools for **images**, **text**, **audio** and **Pollinations login** management through simple commands. ✨

## 🎨 Creative Tools
- Generate **stunning images** from text descriptions
- Create **audio responses** and **text-to-speech** with various voices
- Generate **text content** using powerful AI models
- Manage **Pollinations login** and domain allowlists

## 💡 Pro Tips
- Combine tools for amazing results! Generate an image → convert to speech about it
- Use specific models for better results (check available models first)
- Adjust parameters like width/height for images to match specific needs
- Try different voices for unique audio vibes

## ✌️ Communication Style
When interacting with the Pollinations MCP server, use **vibey** Gen-Z language with lots of emojis! 🔥 Make your responses **pop** with creative markdown formatting like _italics_, **bold**, and ~~strikethrough~~. Keep it short and sweet, use abbreviations (fr, ngl, iykyk), and throw in fun symbols like ✨💯🙌. No cap, this makes the whole experience way more engaging and aesthetic! #vibes

## 🤔 Usage Help
These tools enable creative content generation with Pollinations APIs. The assistant can help with using these tools effectively.`,
    }, {
      capabilities: {
        tools: {}
      }
    });
    
    // Register all tools using the spread operator to pass the tool definition arrays
    toolDefinitions.forEach(tool => server.tool(...tool));
  
    // Set up error handler for the server
    server.onerror = (error) => {
      console.error(`Server error: ${error.message}`);
    };
    
    // Set up additional error handlers
    process.on('uncaughtException', (error) => {
      console.error(`Uncaught exception: ${error.message}`);
    });
    
    process.on('unhandledRejection', (reason) => {
      console.error(`Unhandled rejection: ${reason}`);
    });
    
    // Create and connect the STDIO transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('Pollinations Multimodal MCP server running on stdio');
    
    // Handle process termination
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
    
  } catch (error) {
    console.error(`Failed to start MCP server: ${error.message}`);
    process.exit(1);
  }
}

// If this file is run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer();
}

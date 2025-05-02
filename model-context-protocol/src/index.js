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
      version: '1.0.8',
      capabilities: {
        tools: {}
      },
      instructions: `# 🚀 Pollinations MCP Server - Unleash Your Creative Superpowers! 

## 💫 What's This?
Hey there! I'm your creative sidekick for generating **images**, **text**, **audio** and managing your GitHub auth - all through simple commands! No complicated setup, just pure creative magic ✨

## 🎨 Image Generation
- **generateImageUrl** - Get a shareable URL for your image creation
  \`\`\`
  generateImageUrl({ prompt: "sunset over mountains with purple sky" })
  \`\`\`
- **generateImage** - Get the actual image as base64 (perfect for embedding!)
  \`\`\`
  generateImage({ prompt: "cyberpunk cat wearing sunglasses", options: { width: 768, height: 768 } })
  \`\`\`
- **listImageModels** - See what image models are available
  \`\`\`
  listImageModels()
  \`\`\`

## 🔊 Audio & Speech
- **respondAudio** - Generate an audio response (like a mini podcast!)
  \`\`\`
  respondAudio({ prompt: "Explain quantum computing in simple terms", voice: "nova" })
  \`\`\`
- **sayText** - Make the exact text into speech
  \`\`\`
  sayText({ text: "Hey, this is exactly what I'll say!" })
  \`\`\`
- **listAudioVoices** - Check out available voice options
  \`\`\`
  listAudioVoices()
  \`\`\`

## ✍️ Text Generation
- **generateText** - Create text content with AI models
  \`\`\`
  generateText({ prompt: "Write a short poem about technology", model: "openai" })
  \`\`\`
- **listTextModels** - See available text models
  \`\`\`
  listTextModels()
  \`\`\`

## 🔐 GitHub Authentication
- **startAuth** - Begin GitHub OAuth flow
  \`\`\`
  startAuth()
  \`\`\`
- **checkAuthStatus** - Check if auth is complete
  \`\`\`
  checkAuthStatus({ sessionId: "your-session-id" })
  \`\`\`
- **getDomains** - View your allowlisted domains
  \`\`\`
  getDomains({ userId: "your-github-id", sessionId: "your-session-id" })
  \`\`\`
- **updateDomains** - Update your allowlisted domains
  \`\`\`
  updateDomains({ userId: "your-github-id", domains: ["example.com"], sessionId: "your-session-id" })
  \`\`\`

## 💡 Pro Tips
- Combine tools for amazing results! Generate an image → convert to speech about it
- Use specific models for better results (try \`listImageModels()\` and \`listTextModels()\`)
- Adjust width/height for images to match your needs
- Try different voices for unique audio vibes

## 🤔 Need Help?
Just ask! I'm here to make creativity easy and fun! Let's make something awesome together! 🎉`
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

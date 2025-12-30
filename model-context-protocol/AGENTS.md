# Claude Guidelines for MCP Server Development

## MCP Design Principles

1. **Thin Proxy Design**: The MCP server functions as a thin proxy for Pollinations services:

   - Minimal processing of data between client and API
   - No transformation or normalization of responses
   - Direct pass-through of streams when applicable
   - No unnecessary logic to verify return types or add metadata

2. **API Functions**:

   - `generateImageUrl`: Returns a URL to the generated image
   - `generateImage`: Returns the actual image data as base64-encoded string
   - `generateAudio`: Returns audio data as base64-encoded string
   - `listModels`: Returns available models for image or text generation

3. **Dependencies**:
   - `@modelcontextprotocol/sdk`: Core MCP SDK (version 1.7.0+)
   - `play-sound`: For audio playback functionality
   - `node-fetch`: For making HTTP requests

## MCP Server Implementation Notes

### Important Considerations

1. **Stdio Communication**: The MCP server communicates with Claude Desktop via stdio. This means:

   - Never use `console.log()` in any code that's imported by the MCP server, as it will interfere with the JSON communication protocol
   - Always use `console.error()` for debugging, but be aware that excessive logging can still cause issues
   - When testing outside of Claude, you can use `console.log()` freely

2. **Response Format**:

   - All tool responses to Claude must be properly formatted JSON
   - For text responses, wrap them in a JSON structure and use `JSON.stringify()` before returning
   - Follow the pattern used by existing functions like `generateImageUrl` and `listModels`

3. **Audio Implementation**:

   - Audio is generated via the `gen.pollinations.ai` API
   - The MCP server plays audio locally on the system rather than trying to return audio data to Claude
   - The `play-sound` package is used for local audio playback

4. **Thin Proxy Design**:

   - The Pollinations API client should function as a thin proxy
   - Avoid transforming or processing stream data
   - Don't add unnecessary metadata or normalizations
   - Keep the code simple and avoid unnecessary operations

5. **Testing**:
   - Test MCP functions independently using the test-mcp-client.js script

## Key Components

- `pollinations-api-client.js`: Core API client with functions for image/audio generation and model listing
- `pollinations-mcp-server.js`: MCP server implementation that handles tool requests
- `test-mcp-client.js`: Test script for verifying functionality

## Development Guidelines

1. **Testing**:

   - Test with real production code, not mocks
   - Use the test-mcp-client.js script for independent testing
   - Always restart Claude Desktop after making changes

2. **Code Style**:

   - Follow the thin proxy principle
   - Minimize data transformation
   - Keep functions simple and focused
   - Use proper error handling

3. **Communication**:
   - Never use console.log() in MCP server code
   - Use console.error() sparingly for debugging
   - Ensure all responses are properly formatted JSON

# Pollinations Multimodal MCP Server

A Model Context Protocol (MCP) server for the Pollinations APIs that enables AI assistants like Claude to generate images, text, and audio directly.

## Features

- Generate image URLs from text prompts
- Generate actual images and return them as base64-encoded data
- Generate text responses from text prompts
- Generate audio (text-to-speech) from text prompts
- List available image and text generation models
- No authentication required
- Simple and lightweight
- Compatible with the Model Context Protocol (MCP)

## System Requirements

- **Node.js**: Version 14.0.0 or higher
  - For best performance, we recommend Node.js 16.0.0 or higher
  - Node.js versions below 16 use an AbortController polyfill

## Quick Start

The easiest way to use the MCP server:

```bash
# Run directly with npx (no installation required)
npx @pollinations/model-context-protocol
```

If you prefer to install it globally:

```bash
# Install globally
npm install -g @pollinations/model-context-protocol

# Run the server
model-context-protocol
```

## Claude Desktop Integration

To install the MCP server in Claude Desktop:

```bash
# Run the installation script
npx @pollinations/model-context-protocol install-claude-mcp
```

This script will automatically:
- Find the Claude Desktop configuration file for your OS
- Add the Pollinations MCP server to the configuration
- Configure it to use npx for easy updates

After installation, restart Claude Desktop and you can use commands like:
```
Generate an image of a sunset over the ocean using the Pollinations API.
```

## Troubleshooting

### "AbortController is not defined" Error

If you encounter this error when running the MCP server:

```
ReferenceError: AbortController is not defined
```

This is usually caused by running on an older version of Node.js (below version 16.0.0). Try one of these solutions:

1. **Update Node.js** (recommended):
   - Update to Node.js 16.0.0 or newer

2. **Use our polyfill** (automatic in version 1.0.6+):
   - Update to the latest version of the package:
   ```bash
   npm install -g @pollinations/model-context-protocol@latest
   # or run with npx
   npx @pollinations/model-context-protocol@latest
   ```
   
3. **Install AbortController manually**:
   - If for some reason the polyfill doesn't work:
   ```bash
   npm install node-abort-controller
   ```

### Check Your Node.js Version

To check your current Node.js version:

```bash
node --version
```

If it shows a version lower than 16.0.0, consider upgrading for best compatibility.

## Available Tools

The MCP server provides the following tools:

1. `generateImageUrl` - Generates an image URL from a text prompt
2. `generateImage` - Generates an image and returns it as base64-encoded data
3. `respondAudio` - Generates an audio response to a text prompt
4. `sayText` - Generates speech that says the provided text verbatim
5. `generateText` - Generates text from a prompt using text models
6. `listModels` - Lists available models for image or text generation

## Changelog

### Version 1.0.6
- Added compatibility with Node.js versions 14.0.0 and later
- Added AbortController polyfill for Node.js versions below 16.0.0
- Fixed "AbortController is not defined" error 
- Improved error handling and reporting
- Added troubleshooting guide in README
- Enhanced documentation with system requirements and installation options

### Version 1.0.5
- Initial public release

## License

MIT
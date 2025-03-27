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

## Quick Start

The easiest way to use the MCP server:

```bash
# Run directly with npx (no installation required)
npx @pollinations/model-context-protocol
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

## Available Tools

The MCP server provides the following tools:

1. `generateImageUrl` - Generates an image URL from a text prompt
2. `generateImage` - Generates an image and returns it as base64-encoded data
3. `respondAudio` - Generates an audio response to a text prompt
4. `sayText` - Generates speech that says the provided text verbatim
5. `generateText` - Generates text from a prompt using text models
6. `listModels` - Lists available models for image or text generation

## For Developers

If you want to use the package in your own projects:

```bash
# Install as a dependency
npm install @pollinations/model-context-protocol

# Import in your code
import { generateImageUrl, generateImage, generateText, respondAudio, sayText, listModels } from '@pollinations/model-context-protocol';
```

## License

MIT
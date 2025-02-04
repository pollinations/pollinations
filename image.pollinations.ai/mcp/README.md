# Pollinations MCP Server

This directory contains the Model Context Protocol (MCP) implementation for image.pollinations.ai, allowing standardized access to Pollinations' image generation capabilities.

## Quick Start

```bash
# Start only the MCP server
npm run start:mcp

# Start both main and MCP servers
npm run start:all
```

The MCP server runs on port 16385 by default (override with MCP_PORT env var).

## Features

### Resources
- `models://list` - Lists available image generation models

### Tools
- `generate-image`
  - Required: prompt
  - Optional: model, seed, width, height, nologo, private, enhance, safe

### Prompt Templates
- `create-image`
  - Required: description
  - Optional: style

## Example

```typescript
const client = new Client({
  name: "example-client",
  version: "1.0.0"
});

await client.connect("http://localhost:16385/mcp");

const result = await client.callTool({
  name: "generate-image",
  arguments: {
    prompt: "A beautiful sunset over mountains",
    model: "flux"
  }
});
```

For detailed documentation, see the [MCP Specification](https://modelcontextprotocol.io).

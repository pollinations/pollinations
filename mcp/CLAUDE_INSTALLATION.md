# Installing the Pollinations API Client in Claude Desktop

This guide will walk you through the steps to install the Pollinations API Client as an MCP server in Claude Desktop.

## Prerequisites

1. Claude Desktop app installed on your computer
2. Node.js installed (version 18 or higher)
3. Basic familiarity with terminal/command line

## Installation Steps

### 1. Install Dependencies

First, make sure you have the required dependencies installed:

```bash
npm install
```

### 2. Installation Options

#### Option A: Automatic Installation (Recommended)

The easiest way to install the Pollinations MCP server in Claude Desktop is to use the provided installation script:

```bash
npm run install-claude-mcp
```

This script will automatically:
- Detect your operating system (macOS, Windows, or Linux)
- Find the Claude Desktop configuration file
- Add the Pollinations MCP server to the configuration

The script uses ES modules syntax and is compatible with the project's module system.

### 3. Make the MCP Server Executable

```bash
chmod +x pollinations-mcp-server.js
```

#### Option B: Manual Configuration

1. Open the Claude Desktop configuration file located at:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. Add the following configuration to the `mcpServers` section:

```json
{
  "mcpServers": {
    "pollinations": {
      "command": "node",
      "args": ["/path/to/pollinations-mcp-server.js"],
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

Replace `/path/to/pollinations-mcp-server.js` with the absolute path to the `pollinations-mcp-server.js` file.

For example, if you cloned this repository to `/Users/username/pollinations-api-client`, the path would be:
`/Users/username/pollinations-api-client/pollinations-mcp-server.js`

### 4. Restart Claude Desktop

Close and restart the Claude Desktop application to load the new MCP server.

## Usage in Claude

Once installed, you can use the Pollinations API in Claude with commands like:

```
Generate an image of a sunset over the ocean using the Pollinations API.
```

Claude will use the MCP server to generate an image URL that you can click on to view the generated image.

## Available Tools

The MCP server provides the following tools to Claude:

1. `generateImageUrl` - Generates an image URL from a text prompt
   - Parameters:
     - `prompt` (string): The text description of the image to generate
     - `options` (object, optional):
       - `model` (string, optional): Model name to use for generation
       - `seed` (number, optional): Seed for reproducible results
       - `width` (number, optional): Width of the generated image
       - `height` (number, optional): Height of the generated image

2. `listModels` - Lists available image generation models
   - No parameters

## Troubleshooting

If Claude doesn't recognize the Pollinations API commands:

1. Check that the MCP server is properly configured in the Claude Desktop config file
2. Ensure the path to the `pollinations-mcp-server.js` file is correct
3. Verify that the `pollinations-mcp-server.js` file has execute permissions
4. Check Claude Desktop logs for any errors

## Uninstalling

To uninstall the MCP server, simply remove the `pollinations` entry from the `mcpServers` section in the Claude Desktop configuration file and restart Claude Desktop.
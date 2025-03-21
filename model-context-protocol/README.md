# Pollinations MCP Server

A Model Context Protocol (MCP) server for the Pollinations Image API that enables AI assistants like Claude to generate images directly.

## Features

- Generate image URLs from text prompts
- Generate actual images and return them as base64-encoded data
- List available image generation models
- No authentication required
- Simple and lightweight
- Compatible with the Model Context Protocol (MCP)

![MCP Server Interface](https://github.com/user-attachments/assets/f0f8b3b5-f798-482b-a00c-ea931c706c93)

## Installation

### Local Installation

```bash
# Clone the repository
git clone https://github.com/pollinations/pollinations.git
cd pollinations/mcp

# Install dependencies
npm install
```

### NPX Installation

You can also run the MCP server directly using npx without installing it:

```bash
npx pollinations-mcp
```

This will start the MCP server immediately, making it available for use with Claude Desktop or other MCP clients.

## Usage as a Node.js Library

### Import the functions

```javascript
import { generateImageUrl, generateImage, listModels } from './src/index.js';
```

### Generate an image URL

```javascript
const imageUrl = await generateImageUrl('A beautiful sunset over the ocean', {
  width: 512,
  height: 512,
  model: 'flux.schnell',  // optional
  seed: 42                // optional
});

console.log(imageUrl);
// Output: { url: 'https://pollinations.ai/p/...', metadata: { ... } }
```

### Generate an image (returns base64-encoded data)

```javascript
const imageData = await generateImage('A cute cat playing with a ball of yarn', {
  width: 512,
  height: 512,
  model: 'flux.schnell',  // optional
  seed: 42                // optional
});

console.log(imageData);
// Output: { 
//   data: 'base64-encoded-image-data', 
//   mimeType: 'image/jpeg', 
//   metadata: { ... } 
// }
```

### List available models

```javascript
const models = await listModels();
console.log(models);
// Output: { models: ['flux.schnell', 'flux.default', ...] }
```

## Running the MCP Server

The MCP server can be run directly from the command line:

```bash
# Make the server executable
chmod +x pollinations-mcp-server.js

# Run the server
./pollinations-mcp-server.js
```

The server communicates using the MCP protocol over stdin/stdout, making it compatible with MCP clients like Claude Desktop.

## Testing the MCP Client

A test script is included to verify that the MCP client is working correctly:

```bash
# Make the test script executable
chmod +x test-mcp-client.js

# Run the test script
./test-mcp-client.js
```

This will test all three functions (generateImageUrl, generateImage, and listModels) and save a test image to the `test-output` directory.

## Integration with Claude Desktop

For detailed instructions on how to install and use the Pollinations MCP server with Claude Desktop, see the [Claude Installation Guide](./CLAUDE_INSTALLATION.md).

## Implementation Details

The MCP server is implemented using the Model Context Protocol SDK and provides three main tools:

1. `generateImageUrl`: Generates an image URL from a text prompt
2. `generateImage`: Generates an image and returns the base64-encoded data
3. `listModels`: Lists available image generation models

The server follows the "thin proxy" design principle, with minimal processing of the data between the client and the Pollinations API.

## API Reference

### generateImageUrl(prompt, options)

Generates an image URL from a text prompt.

**Parameters:**
- `prompt` (string): The text description of the image to generate
- `options` (object, optional):
  - `model` (string, optional): Model name to use for generation
  - `seed` (number, optional): Seed for reproducible results
  - `width` (number, optional): Width of the generated image
  - `height` (number, optional): Height of the generated image

**Returns:**
- `url` (string): URL to the generated image
- `metadata` (object): Additional information about the generated image

### generateImage(prompt, options)

Generates an image from a text prompt and returns the image data.

**Parameters:**
- `prompt` (string): The text description of the image to generate
- `options` (object, optional):
  - `model` (string, optional): Model name to use for generation
  - `seed` (number, optional): Seed for reproducible results
  - `width` (number, optional): Width of the generated image
  - `height` (number, optional): Height of the generated image

**Returns:**
- `data` (string): Base64-encoded image data
- `mimeType` (string): MIME type of the image (e.g., 'image/jpeg')
- `metadata` (object): Additional information about the generated image

### listModels()

Lists available image generation models.

**Returns:**
- `models` (array): List of available model names

## License

MIT
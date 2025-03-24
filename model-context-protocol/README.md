# Pollinations Multimodal MCP Server

A Model Context Protocol (MCP) server for the Pollinations APIs that enables AI assistants like Claude to generate images and audio directly.

## Features

- Generate image URLs from text prompts
- Generate actual images and return them as base64-encoded data
- Generate audio (text-to-speech) from text prompts
- List available image and text generation models
- No authentication required
- Simple and lightweight
- Compatible with the Model Context Protocol (MCP)

![MCP Server Interface](https://github.com/user-attachments/assets/f0f8b3b5-f798-482b-a00c-ea931c706c93)

## Installation

### Local Installation

```bash
# Clone the repository
git clone https://github.com/pollinations/pollinations.git
cd pollinations/model-context-protocol

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
import { generateImageUrl, generateImage, generateAudio, listModels } from './src/index.js';
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
// Output: { imageUrl: 'https://image.pollinations.ai/prompt/...', metadata: { ... } }
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

### Generate audio (returns base64-encoded data)

```javascript
const audioData = await generateAudio('Hello, world! This is a test.', {
  voice: 'alloy',  // optional, default: 'alloy'
  seed: 42         // optional
});

console.log(audioData);
// Output: { 
//   data: 'base64-encoded-audio-data', 
//   mimeType: 'audio/mpeg', 
//   metadata: { ... } 
// }
```

### List available models

```javascript
// List image generation models
const imageModels = await listModels('image');
console.log(imageModels);
// Output: { models: ['flux.schnell', 'flux.default', ...] }

// List text generation models (includes audio models)
const textModels = await listModels('text');
console.log(textModels);
// Output: { models: ['openai', 'mistral', 'openai-audio', ...] }
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

This will test all available functions and save the generated files to the `test-output` directory.

## Integration with Claude Desktop

For detailed instructions on how to install and use the Pollinations MCP server with Claude Desktop, see the [Claude Installation Guide](./CLAUDE_INSTALLATION.md).

## Implementation Details

The MCP server is implemented using the Model Context Protocol SDK and provides four main tools:

1. `generateImageUrl`: Generates an image URL from a text prompt
2. `generateImage`: Generates an image and returns the base64-encoded data
3. `generateAudio`: Generates audio from text and returns the base64-encoded data
4. `listModels`: Lists available models for image or text generation

The server follows the "thin proxy" design principle, with minimal processing of the data between the client and the Pollinations APIs.

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
- `imageUrl` (string): URL to the generated image
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

### generateAudio(prompt, options)

Generates audio from a text prompt and returns the audio data.

**Parameters:**
- `prompt` (string): The text to convert to speech
- `options` (object, optional):
  - `voice` (string, optional): Voice to use for audio generation (default: "alloy")
  - `seed` (number, optional): Seed for reproducible results

**Returns:**
- `data` (string): Base64-encoded audio data
- `mimeType` (string): MIME type of the audio (e.g., 'audio/mpeg')
- `metadata` (object): Additional information about the generated audio

### listModels(type)

Lists available models for image or text generation.

**Parameters:**
- `type` (string, optional): Type of models to list ("image" or "text"). Default: "image"

**Returns:**
- `models` (array): List of available model names for the specified type

## License

MIT
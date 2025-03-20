# Pollinations API Client

A simple client for the Pollinations Image API that doesn't require Cloudflare Workers or any authentication.

## Features

- Generate image URLs from text prompts
- List available image generation models
- No authentication required
- Simple and lightweight

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd pollinations-api-client

# Install dependencies
npm install
```

## Usage

### Import the functions

```javascript
import { generateImageUrl, listModels } from './src/index.js';
```

### Generate an image URL

```javascript
// Generate an image URL with default settings
const result = await generateImageUrl('A beautiful sunset over the ocean');
console.log(result);
// {
//   imageUrl: 'https://image.pollinations.ai/prompt/A%20beautiful%20sunset%20over%20the%20ocean?width=1024&height=1024',
//   prompt: 'A beautiful sunset over the ocean',
//   width: 1024,
//   height: 1024,
//   model: 'flux'
// }

// Generate an image URL with custom settings
const customResult = await generateImageUrl('A futuristic city skyline at night', {
  width: 800,
  height: 600,
  model: 'flux',
  seed: 12345
});
console.log(customResult);
```

### List available models

```javascript
// List available models
const models = await listModels();
console.log(models);
// { models: [ 'flux', 'turbo' ] }
```

## Run the demo

```bash
npm run demo
```

## API Reference

### generateImageUrl(prompt, options)

Generates an image URL from a text prompt using the Pollinations Image API.

**Parameters:**

- `prompt` (string): The text description of the image to generate
- `options` (object, optional): Additional options for image generation
  - `model` (string, optional): Model name to use for generation
  - `seed` (number, optional): Seed for reproducible results
  - `width` (number, optional, default: 1024): Width of the generated image
  - `height` (number, optional, default: 1024): Height of the generated image

**Returns:**

- An object containing:
  - `imageUrl`: The URL of the generated image
  - `prompt`: The original prompt
  - `width`: The width of the image
  - `height`: The height of the image
  - `model`: The model used for generation
  - `seed`: The seed used for generation (if provided)

### listModels()

Lists available image generation models from the Pollinations API.

**Returns:**

- An object containing:
  - `models`: An array of available model names

## License

ISC
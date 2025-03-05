# Pollinations.AI API Documentation

## Cheatsheet

### Image Generation API (Default model: 'flux')

Generate Image: `GET https://image.pollinations.ai/prompt/{prompt}`
- Params: prompt*, model, seed, width, height, nologo, private, enhance, safe
- Return: Image file

List Models: `GET https://image.pollinations.ai/models`

### Text Generation API (Default model: 'openai')

Generate (GET): `GET https://text.pollinations.ai/{prompt}`
- Params: prompt*, model, seed, json, system, private
- Return: Generated text

Generate (POST): `POST https://text.pollinations.ai/`
- Body: messages*, model, seed, jsonMode
- Return: Generated text

OpenAI Compatible: `POST https://text.pollinations.ai/openai`
- Body: Follows OpenAI ChatGPT API format
- Return: OpenAI-style response

List Models: `GET https://text.pollinations.ai/models`

## Feed Endpoints
- Image Feed: GET https://image.pollinations.ai/feed (SSE stream of user-generated images).
- Example:
    data: {
    "width":1024,
    "height":1024,
    "seed":42,
    "model":"flux",
    "imageURL":"https://image.pollinations.ai/prompt/gleaming%20face%20n2xuqsan%2020250205141310",
    "prompt":"A radiant visage illuminated by soft, ethereal light",
    ...
    }

- Text Feed: GET https://text.pollinations.ai/feed (SSE stream of user-generated text)
- Example:
    data: {
    "response": "Cherry Blossom Pink represents the beautiful spring in Tachikawa",
    "model": "openai",
    "messages": [openai messages array],
    ...
    }

*\* required parameter*

### React Hooks (`npm install @pollinations/react`)

usePollinationsText(prompt, options)
- Options: seed, model, systemPrompt
- Return: string | null

usePollinationsImage(prompt, options)
- Options: width, height, model, seed, nologo, enhance
- Return: string | null

usePollinationsChat(initialMessages, options)
- Options: seed, jsonMode, model
- Return: { sendUserMessage: (message) => void, messages: Array<{role, content}> }

Docs: https://pollinations.ai/react-hooks

## Detailed API Documentation

### Image Generation API

#### Generate Image
`GET https://image.pollinations.ai/prompt/{prompt}`

**Parameters:**
- prompt* (required): Text description of the image you want to generate. Should be URL-encoded.
- model: Model to use for generation. See https://image.pollinations.ai/models for available models.
- seed: Seed for reproducible results.
- width: Width of the generated image. Default: 1024
- height: Height of the generated image. Default: 1024
- nologo: Set to 'true' to turn off the rendering of the logo. Default: false
- private: Set to 'true' to prevent the image from appearing in the public feed. Default: false
- enhance: Set to 'true' to turn on prompt enhancing (passes prompts through an LLM to add detail). Default: false
- safe: Set to 'true' to enable strict NSFW content filtering, throwing an error if NSFW content is detected. Default: false

**Return:** Image file (typically JPEG or PNG)

#### Example Usage

```
https://image.pollinations.ai/prompt/A%20beautiful%20sunset%20over%20the%20ocean?width=1280&height=720&seed=42
```

### Text Generation API

#### Generate (GET)
`GET https://text.pollinations.ai/{prompt}`

**Parameters:**
- prompt* (required): Text prompt for the AI to respond to. Should be URL-encoded.
- model: Model to use for text generation. Options: 'openai', 'mistral'. See https://text.pollinations.ai/models for available models.
- seed: Seed for reproducible results.
- json: Set to 'true' to receive response in JSON format.
- system: System prompt to set the behavior of the AI. Should be URL-encoded.
- private: Set to 'true' to prevent the response from appearing in the public feed. Default: false

**Return:** Generated text

#### Generate (POST)
`POST https://text.pollinations.ai/`

**Request Body:**
```json
{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is artificial intelligence?"}
  ],
  "model": "openai",
  "seed": 42,
  "jsonMode": true,  // Optional: Forces the response to be valid JSON
  "private": true    // Optional: Prevents response from appearing in public feed
}
```

**Return:** Generated text

#### Vision Capabilities
The following models support analyzing images through our API:
- `openai`
- `openai-large`
- `claude-hybridspace`

You can pass images either as URLs or base64-encoded data in the messages. See the [OpenAI Vision Guide](https://platform.openai.com/docs/guides/vision) for detailed documentation on the message format.

Note: While we offer other models like Gemini, they currently do not support multimodal (image) inputs.

Example message format with image:
```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "What's in this image?"},
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/image.jpg"
          }
        }
      ]
    }
  ],
  "model": "openai"
}
```

#### Example Usage (GET)

```
https://text.pollinations.ai/What%20is%20artificial%20intelligence?seed=42&json=true&model=mistral&system=You%20are%20a%20helpful%20AI%20assistant
```

## Code Examples

### Python (Image Generation)

```python
import requests

def download_image(prompt, width=768, height=768, model='flux', seed=None):
    url = f"https://image.pollinations.ai/prompt/{prompt}?width={width}&height={height}&model={model}&seed={seed}"
    response = requests.get(url)
    with open('generated_image.jpg', 'wb') as file:
        file.write(response.content)
    print('Image downloaded!')

download_image("A beautiful sunset over the ocean", width=1280, height=720, model='flux', seed=42)
```

### Python (Vision)

```python
import base64
import requests

def analyze_image(image_url):
    response = requests.post('https://text.pollinations.ai/openai', json={
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What's in this image?"},
                    {
                        "type": "image_url",
                        "image_url": {"url": image_url}
                    }
                ]
            }
        ],
        "model": "openai"
    })
    return response.json()

# Example usage
result = analyze_image("https://example.com/image.jpg")
print(result['choices'][0]['message']['content'])
```

### JavaScript (Text Generation)

```javascript
const fetch = require('node-fetch');

async function generateText() {
  const response = await fetch('https://text.pollinations.ai/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is artificial intelligence?' }
      ],
      seed: 42,
      model: 'mistral'
    }),
  });

  const data = await response.json();
  console.log(data);
}

generateText();
```

### HTML (Image Embedding)

```html
<img src="https://image.pollinations.ai/prompt/Modern%20minimalist%20logo" alt="AI-generated logo">
```

## Model Context Protocol (MCP) Interface

Our image generation service supports the [Model Context Protocol](https://modelcontextprotocol.io), providing a standardized way for AI systems to interact with our service.

### MCP Endpoints

- SSE Connection: `GET https://image.pollinations.ai/mcp/sse`
- Message Endpoint: `POST https://image.pollinations.ai/mcp/messages`

### Available Resources

#### Models List
```javascript
// List available models
const models = await client.readResource("models://list");
```

Returns information about available models and their capabilities.

#### Model Capabilities
```javascript
// Get capabilities for a specific model
const capabilities = await client.readResource("capabilities://flux");
```

Returns detailed information about a model's features and limitations.

### Available Tools

#### generate-image
Generate images using any available model.

Parameters:
- prompt* (string): Text description of the image to generate
- model (string, optional): Model to use for generation
- seed (integer, optional): Random seed for reproducibility
- width (integer, optional): Output image width
- height (integer, optional): Output image height
- nologo (boolean, optional): Disable logo watermark
- private (boolean, optional): Keep image private
- enhance (boolean, optional): Enable image enhancement
- safe (boolean, optional): Enable safety filters
- format (string, optional): Output format ('jpeg' or 'png')

```javascript
// Generate an image
const result = await client.callTool({
  name: "generate-image",
  arguments: {
    prompt: "A beautiful sunset over mountains",
    model: "flux",
    width: 1024,
    height: 1024,
    format: "jpeg"
  }
});
```

### Prompt Templates

#### create-image
Helper template for constructing image generation prompts.

Parameters:
- description* (string): Main description of what to generate
- style (string, optional): Visual style to apply
- mood (string, optional): Emotional mood or atmosphere
- details (string, optional): Additional specifications

```javascript
// Use prompt template
const prompt = await client.getPrompt("create-image", {
  description: "A serene mountain landscape",
  style: "oil painting",
  mood: "peaceful",
  details: "morning mist, golden sunlight"
});
```

### Example Usage

```javascript
import { Client } from "@modelcontextprotocol/sdk/client";

// Create MCP client
const client = new Client({
  name: "example-client",
  version: "1.0.0"
});

// Connect to Pollinations MCP server
await client.connect("https://image.pollinations.ai/mcp");

// List available models
const models = await client.readResource("models://list");
console.log("Available models:", models);

// Generate an image
const result = await client.callTool({
  name: "generate-image",
  arguments: {
    prompt: "A beautiful sunset over mountains",
    model: "flux",
    width: 1024,
    height: 1024
  }
});

// Access the generated image
const imageData = result.content[0].data; // Base64 encoded image
const metadata = JSON.parse(result.content[1].text); // Generation metadata
```

## Integration Examples

- Web Design: Use AI-generated images for dynamic content
- E-learning: Generate custom illustrations for concepts
- Chatbots: Enhance responses with relevant images
- Social Media: Create engaging visual content on-the-fly
- AI Systems: Integrate through the Model Context Protocol

For more examples and community projects, visit our [GitHub repository](https://github.com/pollinations/pollinations).

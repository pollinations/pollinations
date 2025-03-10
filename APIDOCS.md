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

### Audio Generation API

Generate Audio: Use the `openai-audio` model
- GET: `https://text.pollinations.ai/{prompt}?model=openai-audio&voice={voice}`
- POST Body: messages*, model (set to "openai-audio"), voice (optional)
- Supported voices: See the list of available voices at `https://text.pollinations.ai/models` (default: "alloy")
- Return: Audio file (MP3 format, Content-Type: audio/mpeg)

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

#### Audio Capabilities

##### Text-to-Speech
The `openai-audio` model supports text-to-speech conversion. The simplest way to use it is with a GET request:

```
https://text.pollinations.ai/Welcome%20to%20Pollinations?model=openai-audio&voice=nova
```

**Parameters:**
- model: Must be set to "openai-audio"
- voice: (Optional) Voice to use for audio generation
  - Supported values: See the list of available voices at `https://text.pollinations.ai/models`
  - Default: "alloy"

**Return:** Audio file in MP3 format (Content-Type: audio/mpeg)

##### Speech-to-Text
Speech-to-text capabilities are also available through the `openai-audio` model.

**Note:** Our audio features follow the OpenAI audio API specification. For more details and advanced usage, see the [OpenAI Audio Guide](https://platform.openai.com/docs/guides/audio).

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

### JavaScript (Audio Generation)

```javascript
const fetch = require('node-fetch');
const fs = require('fs');

async function generateAudio() {
  // Simple GET request for text-to-speech
  const text = "Welcome to Pollinations, where creativity blooms!";
  const voice = "nova"; // Optional voice parameter
  const url = `https://text.pollinations.ai/${encodeURIComponent(text)}?model=openai-audio&voice=${voice}`;
  
  const response = await fetch(url);
  
  // Save the audio file
  const buffer = await response.buffer();
  fs.writeFileSync('generated_audio.mp3', buffer);
  console.log('Audio generated and saved!');
}

generateAudio();
```

### HTML (Image Embedding)

```html
<img src="https://image.pollinations.ai/prompt/Modern%20minimalist%20logo" alt="AI-generated logo">
```

## Integration Examples

For examples and community projects, visit our [GitHub repository](https://github.com/pollinations/pollinations).

## Advanced Features

### Streaming Responses

The Text Generation API supports streaming responses using Server-Sent Events (SSE). This allows you to receive the generated text as it's being produced, rather than waiting for the complete response.

To use streaming:
- Add `stream=true` to your request parameters
- Process the SSE stream in your client code

Example with fetch:
```javascript
const response = await fetch('https://text.pollinations.ai/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Write a story about a robot' }],
    model: 'openai',
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  // Process the SSE chunk
  console.log(chunk);
}
```

### Function Calling

Function calling capabilities are now available for models that support this feature. This allows models to call functions that you define, enabling them to:

- Retrieve real-time information
- Perform calculations
- Take actions based on user input
- Interact with external systems

Our implementation follows the OpenAI API specification for function calling. When using compatible models through our `/openai` endpoint, you can define tools and receive structured function calls from the model.

For complete documentation on how to use this feature, please refer to the [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling).

Basic example:

```javascript
const response = await fetch('https://text.pollinations.ai/openai', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: "openai",
    messages: [
      { role: "user", content: "What's the weather like in Boston?" }
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "get_current_weather",
          description: "Get the current weather in a given location",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "The city and state, e.g. San Francisco, CA"
              },
              unit: {
                type: "string",
                enum: ["celsius", "fahrenheit"]
              }
            },
            required: ["location"]
          }
        }
      }
    ]
  })
});

const data = await response.json();
console.log(data);
```

## Technical Details

### Response Formats

- **Text Models**: 
  - GET requests return plain text
  - POST requests to the root path (/) return plain text
  - POST requests to other endpoints (like /openai) return JSON in OpenAI format

- **Audio Models**:
  - When using the simplified endpoint (GET or POST to /), return binary audio data with Content-Type: audio/mpeg
  - When using the OpenAI-compatible endpoint (/openai), follow the OpenAI API specification

## Acknowledgements

Special thanks to Reverand Dr. Tolerant for their invaluable contributions to the Pollinations community.

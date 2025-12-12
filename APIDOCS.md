# Pollinations.AI API Docs 🌸
## The World's Most Accessible Open GenAI Platform

> **New unified gateway:** use `https://gen.pollinations.ai` (short) or `https://enter.pollinations.ai/api` (full). Both expose the same OpenAI-compatible APIs with API key auth from [enter.pollinations.ai](https://enter.pollinations.ai).

APIs built by developers, for developers. We build everything in the open. 🚀  
Think of Pollinations.AI as a digital garden where you can plant a "seed" (your idea) and watch it grow into text, images, or audio with the help of AI. Our APIs are like tools in your gardening shed—easy to use, powerful, and ready to help you create something beautiful.

## Quick Start
Ready to dive in? Here are some live examples you can try right in your browser to see what Pollinations.AI can do:

- 🖼️ **Create an Image**: Generate a logo for Pollinations.AI [pollinations_logo](https://gen.pollinations.ai/image/pollinations_logo)
- 💬 **Generate Text**: Learn why donating to Pollinations.AI is a great idea [why_you_should_donate](https://gen.pollinations.ai/text/why_you_should_donate)
- 🔍 **Search the Web**: Find the latest news about Pollinations.AI [latest_news](https://gen.pollinations.ai/text/latest_news?model=gemini-search)
- 🎙️ **Create Audio**: Hear a fun, short hypnosis audio encouraging a donation (just for laughs!) [hypnosis_audio](https://gen.pollinations.ai/text/hypnosis_audio?model=openai-audio&voice=nova)

**How to Try These**: Just click the links above, and you’ll see the results instantly in your browser. No coding needed yet!

## Table of Contents
- [Image Generation API](#image-generation-api)
- [Text Generation API](#text-generation-api)
- [Audio Generation API](#audio-generation-api)
- [Vision & Multimodal](#vision--multimodal)
- [Function Calling](#function-calling)
- [Real-time Feeds](#real-time-feeds)
- [React Integration](#react-integration)
- [Authentication & Rate Limits](#authentication--rate-limits)
- [Advanced Features](#advanced-features)
- [Best Practices](#best-practices)
- [Support & Resources](#support--resources)

## Image Generation API
The Image Generation API lets you turn words into pictures. Imagine describing a scene to an artist, and they paint it for you—that’s what this API does, but with AI!

### Generate an Image
**Endpoint**: `GET https://gen.pollinations.ai/image/{prompt}`  
(Full path alternative: `GET https://enter.pollinations.ai/api/generate/image/{prompt}`)

#### Parameters
Here’s what you can customize when generating an image:

| Parameter | Type   | Description                                      | Default | Example                     |
|-----------|--------|--------------------------------------------------|---------|-----------------------------|
| prompt    | string | The description of the image (required)          | -       | "a fluffy dog in a forest"  |
| model     | string | The AI model to use (e.g., flux, turbo)          | flux    | turbo                       |
| width     | integer| Image width in pixels                            | 1024    | 1920                        |
| height    | integer| Image height in pixels                           | 1024    | 1080                        |
| seed      | integer| A number to get the same image every time        | 42      | 12345                       |
| nologo    | boolean| Remove the Pollinations watermark (needs auth)   | false   | true                        |
| enhance   | boolean| Let AI improve your prompt for better results    | false   | true                        |
| private   | boolean| Hide the image from public feeds                 | false   | true                        |
| safe      | boolean| Enable strict NSFW filtering                     | false   | true                        |
| image     | string | URL for image-to-image generation                | -       | https://example.com/pic.jpg |
| transparent | boolean | Request transparent background                 | false   | true                        |

**Analogy**: Think of the prompt as the main idea for your painting, while parameters like width and height are like choosing the size of the canvas. The seed is like telling the artist to paint the same picture again if you give them the same number.

#### Examples

##### Simple Image (Command Line)
```bash
curl -o sunset.jpg "https://gen.pollinations.ai/image/beautiful%20sunset%20over%20ocean"
```

##### Customized Image (Command Line)
```bash
curl -o city.jpg "https://gen.pollinations.ai/image/cyberpunk%20city%20at%20night?width=1920&height=1080&seed=42&model=flux"
```

##### Python Example
```python
import requests
from urllib.parse import quote

prompt = "A serene mountain landscape at sunrise"
url = f"https://gen.pollinations.ai/image/{quote(prompt)}"
params = {"width": 1280, "height": 720, "model": "flux"}

response = requests.get(url, params=params, headers={"Authorization": "Bearer YOUR_KEY"}, timeout=60)
with open("mountain.jpg", "wb") as f:
    f.write(response.content)
print("Image saved as mountain.jpg!")
```

##### JavaScript Example (Node.js)
```javascript
const fetch = require('node-fetch');
const fs = require('fs');

const prompt = "A futuristic city with flying cars";
const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?width=1280&height=720&model=flux`;

fetch(url, { headers: { Authorization: "Bearer YOUR_KEY" } })
  .then(response => response.buffer())
  .then(buffer => {
    fs.writeFileSync('city.jpg', buffer);
    console.log('Image saved as city.jpg!');
  })
  .catch(error => console.error('Error:', error));
```

### List Available Models
**Endpoint**: `GET https://gen.pollinations.ai/image/models`  

```bash
curl https://gen.pollinations.ai/image/models -H "Authorization: Bearer YOUR_KEY"
```

**What You’ll Get**: A list like `["flux", "turbo", "seedream"]`, showing the available models.

## Text Generation API
The Text Generation API is like having a super-smart assistant who can answer questions, write stories, or explain complex ideas based on your prompts.

### Simple Text Generation
**Endpoint**: `GET https://gen.pollinations.ai/text/{prompt}`  

#### Parameters
| Parameter   | Type   | Description                                    | Default       | Example                     |
|-------------|--------|------------------------------------------------|---------------|-----------------------------|
| prompt      | string | Your question or task (required)               | -             | "Write a poem about stars"  |
| model       | string | The AI model to use                            | openai        | mistral                     |
| seed        | integer| For consistent responses                        | random        | 123                         |
| temperature | float  | Controls creativity (0.0=strict, 3.0=wild)     | model default | 1.5                         |
| system      | string | Instructions for the AI’s behavior              | -             | "Act like a pirate"         |
| json        | boolean| Get response in JSON format                    | false         | true                        |
| stream      | boolean| Get response in real-time chunks               | false         | true                        |

#### Examples
##### Basic Query (Command Line)
```bash
curl "https://gen.pollinations.ai/text/What%20is%20the%20capital%20of%20France?"
```

##### Creative Text (Command Line)
```bash
curl "https://gen.pollinations.ai/text/Write%20a%20haiku%20about%20AI?model=mistral&temperature=1.5"
```

##### Python Example
```python
import requests
from urllib.parse import quote

prompt = "Explain quantum computing simply"
url = f"https://gen.pollinations.ai/text/{quote(prompt)}"
params = {"model": "openai", "temperature": 0.7}
response = requests.get(url, params=params, headers={"Authorization": "Bearer YOUR_KEY"})
print(response.text)
```

##### JavaScript Example (Node.js)
```javascript
const fetch = require('node-fetch');

const prompt = "Write a short story about a robot learning to love";
const url = `https://gen.pollinations.ai/text/${encodeURIComponent(prompt)}?model=openai&temperature=1.0`;
fetch(url, { headers: { Authorization: "Bearer YOUR_KEY" } })
  .then(response => response.text())
  .then(text => console.log('Story:', text))
  .catch(error => console.error('Error:', error));
```

### Advanced Text Generation (OpenAI Compatible)
**Endpoint**: `POST https://gen.pollinations.ai/v1/chat/completions`

#### Request Body
```json
{
  "model": "openai",
  "messages": [
    {"role": "system", "content": "You are a friendly teacher."},
    {"role": "user", "content": "Explain gravity in simple terms."}
  ],
  "temperature": 0.7,
  "max_tokens": 500,
  "stream": false
}
```

#### Reasoning Control
`reasoning_effort` controls how deeply the AI thinks:

| Level   | Description                     | Best For                     |
|---------|---------------------------------|------------------------------|
| minimal | Quick, simple answers           | Extracting data, formatting  |
| low     | Light reasoning, fast           | Simple questions             |
| medium  | Balanced thinking (default)     | General tasks                |
| high    | Deep analysis                   | Complex problems             |

#### Example (Command Line)
```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "model": "openai",
    "reasoning_effort": "high",
    "messages": [{"role": "user", "content": "Plan a 7-day cross-country road trip from New York to Los Angeles"}]
  }'
```

##### Python Example
```python
import requests

payload = {
    "model": "openai",
    "reasoning_effort": "minimal",
    "messages": [
        {"role": "user", "content": "Extract all email addresses from this text: Contact us at info@example.com or support@test.org"}
    ]
}
response = requests.post(
    "https://gen.pollinations.ai/v1/chat/completions",
    json=payload,
    headers={"Authorization": "Bearer YOUR_KEY"}
)
print(response.json()['choices'][0]['message']['content'])
```

##### JavaScript Example (Node.js)
```javascript
const fetch = require('node-fetch');

const payload = {
    model: "openai",
    reasoning_effort: "minimal",
    messages: [
        {
            role: "user",
            content: "Extract all email addresses from this text: Contact us at info@example.com or support@test.org"
        }
    ]
};

fetch('https://gen.pollinations.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer YOUR_KEY' },
    body: JSON.stringify(payload)
})
    .then(response => response.json())
    .then(result => {
        console.log(result.choices[0].message.content);
    })
    .catch(error => console.error('Error:', error));
```

### List Available Models
**Endpoint**: `GET https://gen.pollinations.ai/v1/models`

```bash
curl https://gen.pollinations.ai/v1/models -H "Authorization: Bearer YOUR_KEY"
```

## Audio Generation API
The Audio Generation API lets you turn text into speech or transcribe audio into text. It’s like having a voice actor or a transcriptionist at your fingertips.

### Text-to-Speech (Simple)
**Endpoint**: `POST https://gen.pollinations.ai/v1/chat/completions` with `model=openai-audio` and `modalities`.

#### Available Voices
- **alloy**: Neutral, professional
- **echo**: Deep, resonant
- **fable**: Storyteller vibe
- **onyx**: Warm, rich
- **nova**: Bright, friendly
- **shimmer**: Soft, melodic

#### Examples
##### Basic Text-to-Speech (Command Line)
```bash
curl -o speech.mp3 "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai-audio",
    "messages": [{"role": "user", "content": "Hello world"}],
    "modalities": ["text", "audio"],
    "audio": {"voice": "nova", "format": "mp3"}
  }'
```

##### Python Example
```python
import requests

payload = {
    "model": "openai-audio",
    "messages": [{"role": "user", "content": "You are capable of amazing things!"}],
    "modalities": ["text", "audio"],
    "audio": {"voice": "alloy", "format": "mp3"}
}
response = requests.post("https://gen.pollinations.ai/v1/chat/completions", json=payload, headers={"Authorization": "Bearer YOUR_KEY"})
with open("motivation.mp3", "wb") as f:
    f.write(response.content)
print("Audio saved as motivation.mp3!")
```

##### JavaScript Example (Node.js)
```javascript
const fetch = require('node-fetch');
const fs = require('fs');

const payload = {
  model: "openai-audio",
  messages: [{ role: "user", content: "Welcome to my app!" }],
  modalities: ["text", "audio"],
  audio: { voice: "shimmer", format: "mp3" }
};

fetch('https://gen.pollinations.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer YOUR_KEY' },
  body: JSON.stringify(payload)
})
  .then(response => response.buffer())
  .then(buffer => {
    fs.writeFileSync('greeting.mp3', buffer);
    console.log('Audio saved as greeting.mp3!');
  })
  .catch(error => console.error('Error:', error));
```

### Speech-to-Text
Use `model=openai-audio` with an input audio part.

```json
{
  "model": "openai-audio",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "Transcribe this audio:"},
      {"type": "input_audio", "input_audio": {"data": "base64_encoded_audio", "format": "wav"}}
    ]
  }]
}
```

## Vision & Multimodal

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "model": "openai",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "What’s in this image?"},
        {"type": "image_url", "image_url": {"url": "https://example.com/sunset.jpg"}}
      ]
    }],
    "max_tokens": 500
  }'
```

## Function Calling
Function calling lets the AI interact with external tools.

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "model": "openai",
    "messages": [{"role": "user", "content": "What's the weather in Tokyo?"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string", "description": "City and state, e.g. Boston, MA"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
          },
          "required": ["location"]
        }
      }
    }],
    "tool_choice": "auto"
  }'
```

## Real-time Feeds

### Image Feed
**Endpoint**: `GET https://enter.pollinations.ai/api/generate/image/feed` (SSE)

```python
import sseclient
import requests
import json

response = requests.get(
    "https://enter.pollinations.ai/api/generate/image/feed",
    stream=True,
    headers={"Accept": "text/event-stream", "Authorization": "Bearer YOUR_KEY"}
)
client = sseclient.SSEClient(response)
for event in client.events():
    data = json.loads(event.data)
    print(f"New image: {data['prompt']}")
    print(f"URL: {data['imageURL']}")
```

### Text Feed
**Endpoint**: `GET https://enter.pollinations.ai/api/generate/text/feed` (SSE)

```python
import sseclient
import requests
import json

response = requests.get(
    "https://enter.pollinations.ai/api/generate/text/feed",
    stream=True,
    headers={"Accept": "text/event-stream", "Authorization": "Bearer YOUR_KEY"}
)
client = sseclient.SSEClient(response)
for event in client.events():
    data = json.loads(event.data)
    print(f"Model: {data['model']}")
    print(f"Response: {data['response'][:100]}...")
```

## React Integration
If you’re building a web app with React, Pollinations.AI has hooks to make integration super easy.

### Install the Library
```bash
npm install @pollinations/react
```

### Image Generation Hook
```javascript
import { usePollinationsImage } from '@pollinations/react';

function ImageGenerator() {
  const imageUrl = usePollinationsImage('sunset over mountains', {
    width: 1024,
    height: 1024,
    model: 'flux'
  });

  return imageUrl ? <img src={imageUrl} alt="Generated Sunset" /> : <p>Loading...</p>;
}
```

### Text Generation Hook
```javascript
import { usePollinationsText } from '@pollinations/react';

function TextGenerator() {
  const text = usePollinationsText('Write a haiku about AI', {
    model: 'openai',
    seed: 42
  });

  return text ? <p>{text}</p> : <p>Loading...</p>;
}
```

### Chat Hook
```javascript
import { usePollinationsChat } from '@pollinations/react';

function ChatBot() {
  const { messages, sendUserMessage } = usePollinationsChat(
    [{ role: 'system', content: 'You are a helpful assistant' }],
    { model: 'openai' }
  );

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
      <button onClick={() => sendUserMessage({
        role: 'user',
        content: 'Tell me a fun fact!'
      })}>
        Send
      </button>
    </div>
  );
}
```

**Playground**: Try these hooks live at [react-hooks.pollinations.ai](https://react-hooks.pollinations.ai).

## Authentication & Rate Limits
Thanks to our supporters, daily Pollen grants keep AI accessible for everyone. Register for higher limits and extra features like removing watermarks.

### Authentication Methods
- Use API keys from [enter.pollinations.ai](https://enter.pollinations.ai): `Authorization: Bearer YOUR_KEY` or `?key=YOUR_KEY`.
- Publishable keys (`pk_`) are safe for clients (rate limited). Secret keys (`sk_`) are for servers and required for paid models.

### Access Tiers (example defaults)
| Tier     | Rate Limit             | Models Available | Access             | Notes                     |
|----------|------------------------|------------------|--------------------|---------------------------|
| Anonymous| One request every 15s | Basic models     | No signup          | Good for testing          |
| Seed     | Faster                | Standard models  | Free registration  | Sign up at enter.pollinations.ai |
| Flower   | Higher                | Advanced models  | Paid tier          | Higher limits             |
| Nectar   | Highest               | All models       | Enterprise         | Contact Pollinations.AI   |

**Images may include watermarks on free tiers; register to remove them.**

## Advanced Features
### Image-to-Image Generation
Use `image` parameter with `model=kontext` or other supported models.

```bash
curl -o logo_cake.png "https://gen.pollinations.ai/image/bake_a_cake_from_this_logo?model=kontext&image=https://avatars.githubusercontent.com/u/86964862" \
  -H "Authorization: Bearer YOUR_KEY"
```

### Safe Content Filtering
Enable with `safe=true`:
```bash
curl -o safe_image.jpg "https://gen.pollinations.ai/image/a%20beautiful%20landscape?safe=true" \
  -H "Authorization: Bearer YOUR_KEY"
```

### Reasoning Controls
Control how deeply the AI thinks using `reasoning_effort` on chat models.

## Best Practices
Here are tips to make the most of the API:

### Security
- **Keep Tokens Safe**: Never put secrets in frontend code. Use publishable keys client-side and secret keys on servers.

### Performance
- **Use seed**: Set a `seed` parameter (e.g., `seed=123`) to get consistent results.
- **Stream Responses**: For long text responses, set `stream=true` to get chunks as they’re generated.
- **Cache Results**: Save API responses locally to avoid repeating requests for the same data.

### Rate Limits
- **Stay Within Limits**: Respect rate limits; upgrade for higher tiers.
- **Retry Smartly**: If you hit a limit, wait and try again (exponential backoff).
- **Register Your App**: Sign up at [enter.pollinations.ai](https://enter.pollinations.ai) for better performance.

## Support & Resources
- **Documentation**: [github.com/pollinations/pollinations](https://github.com/pollinations/pollinations)
- **Dashboard & API keys**: [enter.pollinations.ai](https://enter.pollinations.ai)
- **React Playground**: [react-hooks.pollinations.ai](https://react-hooks.pollinations.ai)
- **Community**: Join our community on X for updates and tips.

## License
**MIT License**  
You’re free to use, modify, and share this API under the MIT License. Think of it as an open-source recipe you can tweak and share with others!

Made with ❤️ by the Pollinations.AI team

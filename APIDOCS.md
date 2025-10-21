# Pollinations.AI API Documentation

**The World's Most Accessible Open GenAI Platform**  
Text, Image & Audio APIs with zero signup required 🚀

---

## Quick Start

Try these live examples in your browser:

- **🖼️ Image Generation:** [pollinations_logo](https://image.pollinations.ai/prompt/pollinations_logo)
- **💬 Text Generation:** [why_you_should_donate](https://text.pollinations.ai/why_you_should_donate_to_pollinations_ai)
- **🔍 Web Search:** [latest_news](https://text.pollinations.ai/what_are_the_last_pollinations_ai_news?model=searchgpt)
- **🎙️ Audio Generation:** [hypnosis_audio](https://text.pollinations.ai/respond_with_a_small_hypnosis_urging_to_donate_to_pollinations_its_a_joke?model=openai-audio&voice=nova)

---

## Table of Contents

- [Image Generation API](#image-generation-api)
- [Text Generation API](#text-generation-api)
- [Audio Generation API](#audio-generation-api)
- [Vision & Multimodal](#vision--multimodal)
- [Function Calling](#function-calling)
- [Real-time Feeds](#real-time-feeds)
- [React Integration](#react-integration)
- [Authentication & Rate Limits](#authentication--rate-limits)

---

## Image Generation API

### Generate Image

**Endpoint:** `GET https://image.pollinations.ai/prompt/{prompt}`

Create images from text descriptions using state-of-the-art models.

#### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `prompt` | string | URL-encoded text description (required) | - |
| `model` | string | Generation model (flux, turbo, etc.) | `flux` |
| `width` | integer | Image width in pixels | `1024` |
| `height` | integer | Image height in pixels | `1024` |
| `seed` | integer | Seed for reproducible results | random |
| `nologo` | boolean | Remove watermark (registered users only) | `false` |
| `enhance` | boolean | Enhance prompt with AI | `false` |
| `private` | boolean | Hide from public feed | `false` |

#### Examples

**Simple Image**
```bash
curl -o sunset.jpg "https://image.pollinations.ai/prompt/beautiful%20sunset%20over%20ocean"
```

**Advanced Options**
```bash
curl "https://image.pollinations.ai/prompt/cyberpunk%20city?width=1920&height=1080&seed=42&model=flux"
```

**Python**
```python
import requests
from urllib.parse import quote

prompt = "A serene mountain landscape"
url = f"https://image.pollinations.ai/prompt/{quote(prompt)}"
params = {"width": 1280, "height": 720, "model": "flux"}

response = requests.get(url, params=params, timeout=60)
with open('image.jpg', 'wb') as f:
    f.write(response.content)
```

### List Available Models

**Endpoint:** `GET https://image.pollinations.ai/models`

Returns available image generation models.

```bash
curl https://image.pollinations.ai/models
```

---

## Text Generation API

### Simple Text Generation

**Endpoint:** `GET https://text.pollinations.ai/{prompt}`

Generate text responses from simple prompts.

#### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `prompt` | string | URL-encoded prompt (required) | - |
| `model` | string | AI model to use | `openai` |
| `seed` | integer | Reproducible results | random |
| `temperature` | float | Creativity (0.0-3.0) | model default |
| `system` | string | System instructions | - |
| `json` | boolean | Return JSON formatted response | `false` |
| `stream` | boolean | Stream response via SSE | `false` |

#### Examples

**Basic Query**
```bash
curl "https://text.pollinations.ai/What%20is%20the%20capital%20of%20France?"
```

**With Options**
```bash
curl "https://text.pollinations.ai/Write%20a%20haiku%20about%20AI?model=mistral&temperature=1.5"
```

**Python**
```python
import requests
from urllib.parse import quote

prompt = "Explain quantum computing simply"
url = f"https://text.pollinations.ai/{quote(prompt)}"
params = {"model": "openai", "temperature": 0.7}

response = requests.get(url, params=params)
print(response.text)
```

### Advanced Text Generation (OpenAI Compatible)

**Endpoint:** `POST https://text.pollinations.ai/openai`

Full-featured chat completions with vision, audio, and function calling support.

#### Request Body

```json
{
  "model": "openai",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Tell me about Paris."}
  ],
  "temperature": 0.7,
  "max_tokens": 500,
  "stream": false
}
```

#### Key Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `messages` | array | Conversation history (required) |
| `model` | string | Model identifier (required) |
| `temperature` | float | Creativity level (0.0-3.0) |
| `max_tokens` | integer | Maximum response length |
| `stream` | boolean | Enable streaming responses |
| `tools` | array | Function calling definitions |
| `reasoning_effort` | string | Reasoning depth (minimal/low/medium/high) |

#### Reasoning Control

Control how deeply models think before responding:

| Level | Description | Best For |
|-------|-------------|----------|
| `minimal` | Fastest, least reasoning | Simple extraction, formatting |
| `low` | Quick with light reasoning | Straightforward queries |
| `medium` | Balanced approach (default) | General-purpose tasks |
| `high` | Deep, thorough reasoning | Complex planning, multi-step problems |

**Example:**
```bash
curl https://text.pollinations.ai/openai \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "reasoning_effort": "high",
    "messages": [{"role": "user", "content": "Plan a cross-country road trip"}]
  }'
```

### List Available Models

**Endpoint:** `GET https://text.pollinations.ai/models`

Returns all available text models with capabilities.

```bash
curl https://text.pollinations.ai/models
```

---

## Audio Generation API

### Text-to-Speech (Simple)

**Endpoint:** `GET https://text.pollinations.ai/{prompt}?model=openai-audio&voice={voice}`

Convert text to speech with various voices.

#### Available Voices
`alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

#### Examples

**Basic TTS**
```bash
curl -o speech.mp3 "https://text.pollinations.ai/Hello%20world?model=openai-audio&voice=nova"
```

**Python**
```python
import requests
from urllib.parse import quote

text = "Welcome to Pollinations AI"
url = f"https://text.pollinations.ai/{quote(text)}"
params = {"model": "openai-audio", "voice": "alloy"}

response = requests.get(url, params=params)
with open('speech.mp3', 'wb') as f:
    f.write(response.content)
```

### Speech-to-Text

**Endpoint:** `POST https://text.pollinations.ai/openai`

Transcribe audio files to text.

#### Request Format

```json
{
  "model": "openai-audio",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "Transcribe this:"},
      {
        "type": "input_audio",
        "input_audio": {
          "data": "base64_encoded_audio",
          "format": "wav"
        }
      }
    ]
  }]
}
```

#### Example

```python
import requests
import base64

with open('audio.wav', 'rb') as f:
    audio_data = base64.b64encode(f.read()).decode()

payload = {
    "model": "openai-audio",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "Transcribe:"},
            {
                "type": "input_audio",
                "input_audio": {"data": audio_data, "format": "wav"}
            }
        ]
    }]
}

response = requests.post(
    "https://text.pollinations.ai/openai",
    json=payload
)
print(response.json()['choices'][0]['message']['content'])
```

---

## Vision & Multimodal

Analyze images using AI vision models.

### Supported Models
- `openai` - Standard vision capabilities
- `openai-large` - Enhanced vision model
- `claude-hybridspace` - Alternative vision model

### Image Analysis

**Using URL**
```python
import requests

payload = {
    "model": "openai",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "What's in this image?"},
            {
                "type": "image_url",
                "image_url": {"url": "https://example.com/image.jpg"}
            }
        ]
    }],
    "max_tokens": 500
}

response = requests.post(
    "https://text.pollinations.ai/openai",
    json=payload
)
print(response.json()['choices'][0]['message']['content'])
```

**Using Base64**
```python
import base64

with open('image.jpg', 'rb') as f:
    image_data = base64.b64encode(f.read()).decode()

payload = {
    "model": "openai",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "Describe this image"},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{image_data}"
                }
            }
        ]
    }]
}
```

---

## Function Calling

Enable AI to call external functions for dynamic interactions.

### Example: Weather Function

```python
import requests

tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City and state, e.g. Boston, MA"
                },
                "unit": {
                    "type": "string",
                    "enum": ["celsius", "fahrenheit"]
                }
            },
            "required": ["location"]
        }
    }
}]

# Initial request
payload = {
    "model": "openai",
    "messages": [{"role": "user", "content": "What's the weather in Tokyo?"}],
    "tools": tools,
    "tool_choice": "auto"
}

response = requests.post(
    "https://text.pollinations.ai/openai",
    json=payload
).json()

# Check if model wants to call function
if response['choices'][0]['message'].get('tool_calls'):
    tool_call = response['choices'][0]['message']['tool_calls'][0]
    
    # Execute your function here
    weather_data = get_weather(location="Tokyo")
    
    # Send result back
    messages = [
        {"role": "user", "content": "What's the weather in Tokyo?"},
        response['choices'][0]['message'],
        {
            "role": "tool",
            "tool_call_id": tool_call['id'],
            "content": weather_data
        }
    ]
    
    final_response = requests.post(
        "https://text.pollinations.ai/openai",
        json={"model": "openai", "messages": messages}
    )
```

---

## Real-time Feeds

Monitor live generation activity via Server-Sent Events.

### Image Feed

**Endpoint:** `GET https://image.pollinations.ai/feed`

Stream of newly generated images.

```python
import sseclient
import requests

response = requests.get(
    'https://image.pollinations.ai/feed',
    stream=True,
    headers={'Accept': 'text/event-stream'}
)

client = sseclient.SSEClient(response)
for event in client.events():
    data = json.loads(event.data)
    print(f"New image: {data['prompt']}")
    print(f"URL: {data['imageURL']}")
```

### Text Feed

**Endpoint:** `GET https://text.pollinations.ai/feed`

Stream of text generation activity.

```python
response = requests.get(
    'https://text.pollinations.ai/feed',
    stream=True,
    headers={'Accept': 'text/event-stream'}
)

client = sseclient.SSEClient(response)
for event in client.events():
    data = json.loads(event.data)
    print(f"Model: {data['model']}")
    print(f"Response: {data['response'][:100]}...")
```

---

## React Integration

Install the React hooks library:

```bash
npm install @pollinations/react
```

### Image Generation Hook

```jsx
import { usePollinationsImage } from '@pollinations/react';

function ImageGenerator() {
  const imageUrl = usePollinationsImage('sunset over mountains', {
    width: 1024,
    height: 1024,
    model: 'flux'
  });

  return <img src={imageUrl} alt="Generated" />;
}
```

### Text Generation Hook

```jsx
import { usePollinationsText } from '@pollinations/react';

function TextGenerator() {
  const text = usePollinationsText('Write a haiku about AI', {
    model: 'openai',
    seed: 42
  });

  return <p>{text}</p>;
}
```

### Chat Hook

```jsx
import { usePollinationsChat } from '@pollinations/react';

function ChatBot() {
  const { messages, sendUserMessage } = usePollinationsChat(
    [{ role: 'system', content: 'You are helpful' }],
    { model: 'openai' }
  );

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>{msg.content}</div>
      ))}
      <button onClick={() => sendUserMessage({
        role: 'user',
        content: 'Hello!'
      })}>
        Send
      </button>
    </div>
  );
}
```

**Playground:** [react-hooks.pollinations.ai](https://react-hooks.pollinations.ai/)

---

## Authentication & Rate Limits

### Overview

Authentication is **optional** but recommended for better performance and higher limits.

**Get Started:** Visit [auth.pollinations.ai](https://auth.pollinations.ai)

### Authentication Methods

#### 1. Referrer (Web Apps)

Best for frontend applications. Browsers automatically send the referrer header.

```bash
# Automatic via browser
# OR explicit:
https://image.pollinations.ai/prompt/landscape?referrer=myapp.com
```

#### 2. Bearer Token (Backend)

Recommended for server applications.

```bash
curl https://text.pollinations.ai/openai \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai", "messages": [...]}'
```

### Access Tiers

| Tier | Rate Limit | Models | Access |
|------|------------|--------|--------|
| **Anonymous** | 15 sec | Limited | Default (no signup) |
| **Seed** | 5 sec | Standard | Free registration |
| **Flower** | 3 sec | Advanced | Paid tier |
| **Nectar** | None | All | Enterprise |

**Starting March 31, 2025:**
- Free tier may include watermarks/attribution
- Register at [auth.pollinations.ai](https://auth.pollinations.ai) to remove

---

## Best Practices

### Security
- **Never expose tokens in frontend code**
- Use referrer authentication for web apps
- Use Bearer tokens for backend services

### Performance
- Use `seed` parameter for reproducible results
- Enable streaming for long responses
- Cache results when appropriate

### Rate Limits
- Respect tier limits
- Implement exponential backoff
- Register your application for higher limits

---

## Support & Resources

- **Documentation:** [github.com/pollinations/pollinations](https://github.com/pollinations/pollinations)
- **Authentication:** [auth.pollinations.ai](https://auth.pollinations.ai)
- **React Playground:** [react-hooks.pollinations.ai](https://react-hooks.pollinations.ai)

---

## License

MIT License - Free to use, modify, and distribute.

---

Made with ❤️ by the Pollinations.AI team

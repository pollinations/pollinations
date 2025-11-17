# Pollinations.AI API Documentation 🌸
## The Most Accessible Open Generative AI Platform

Welcome to the Pollinations.AI API documentation. Pollinations.AI provides seamless API endpoints to generate text, images, and audio. Our platform is designed to be highly accessible—no sign-up is required to get started, yet robust authentication and extended features are available for advanced users.

---

## Quick Start

Try these APIs instantly in your browser, command line, or code. For developer convenience and rapid prototyping, example requests are provided in several languages.

### Live Examples

- **Generate Image:** [pollinations_logo](https://image.pollinations.ai/prompt/pollinations_logo)
- **Text Generation:** [why_you_should_donate](https://text.pollinations.ai/why_you_should_donate)
- **Latest News:** [latest_news](https://text.pollinations.ai/latest_news?model=gemini-search)
- **Create Audio:** [hypnosis_audio](https://text.pollinations.ai/hypnosis_audio?model=openai-audio&voice=nova)

---

## Table of Contents

- [Image Generation API](#image-generation-api)
- [Text Generation API](#text-generation-api)
- [Audio Generation API](#audio-generation-api)
- [Vision & Multimodal API](#vision--multimodal-api)
- [Function Calling](#function-calling)
- [Real-time Feeds](#real-time-feeds)
- [React Integration](#react-integration)
- [Authentication & Rate Limits](#authentication--rate-limits)
- [Advanced Features](#advanced-features)
- [Best Practices](#best-practices)
- [Support & Resources](#support--resources)
- [License](#license)

---

## Image Generation API

Programmatically generate images via natural language.

### Endpoint

```
GET https://image.pollinations.ai/prompt/{prompt}
```

#### Parameters

| Name      | Type     | Description                                                    | Default | Example                        |
| --------- | -------- | -------------------------------------------------------------- | ------- | ------------------------------ |
| prompt    | string   | Text description of the image (required)                       | -       | "A fluffy dog in a forest"     |
| model     | string   | AI model for generation (e.g., flux, turbo, stable-diffusion)  | flux    | turbo                          |
| width     | integer  | Image width in pixels                                          | 1024    | 1920                           |
| height    | integer  | Image height in pixels                                         | 1024    | 1080                           |
| seed      | integer  | Seed for deterministic output                                  | random  | 12345                          |
| nologo    | boolean  | Remove Pollinations watermark (account required)               | false   | true                           |
| enhance   | boolean  | Enhance prompt for higher quality                              | false   | true                           |
| private   | boolean  | Hide from public feeds                                         | false   | true                           |
| safe      | boolean  | Strict NSFW filtering                                          | false   | true                           |
| image     | string   | (kontext) Input image URL to guide or transform                | -       | "https://domain.com/image.jpg" |

#### Example: Generate a Simple Image (Shell)

```bash
curl -o sunset.jpg "https://image.pollinations.ai/prompt/beautiful%20sunset%20over%20ocean"
```

#### Example: High-Resolution & Custom Model

```bash
curl -o cyberpunk.jpg "https://image.pollinations.ai/prompt/cyberpunk%20city%20at%20night?width=1920&height=1080&seed=42&model=flux"
```

#### Example: Strict Safe Content Filtering

```bash
curl -o safe_image.jpg "https://image.pollinations.ai/prompt/a%20beautiful%20landscape?safe=true"
```

#### Example: Python Usage with Error Handling

```python
import requests
from urllib.parse import quote

prompt = "A serene mountain landscape at sunrise"
url = f"https://image.pollinations.ai/prompt/{quote(prompt)}"
params = {"width": 1280, "height": 720, "model": "flux"}

try:
    response = requests.get(url, params=params, timeout=60)
    response.raise_for_status()
    with open("mountain.jpg", "wb") as f:
        f.write(response.content)
    print("Image saved as mountain.jpg!")
except requests.RequestException as e:
    print(f"Image generation failed: {e}")
```

#### Example: JavaScript (Node.js) - Async/Await and Error Handling

```javascript
const fetch = require('node-fetch');
const fs = require('fs').promises;

async function generateImage(prompt) {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720&model=flux`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const buffer = await response.buffer();
        await fs.writeFile('output.jpg', buffer);
        console.log('Image saved as output.jpg!');
    } catch (err) {
        console.error('Error:', err);
    }
}
generateImage('A futuristic city with flying cars');
```

#### Example: Image-to-Image (Style Transfer with Kontext)

```bash
curl -o styled.jpg "https://image.pollinations.ai/prompt/turn%20this%20into%20a%20watercolor%20painting?model=kontext&image=https://www.example.com/photo.jpg&width=512&height=512"
```

#### List Models

```bash
curl https://image.pollinations.ai/models
```

---

## Text Generation API

The Text API provides advanced text synthesis, Q&A, summarization, and custom persona instructions.

### Endpoint

```
GET https://text.pollinations.ai/{prompt}
```

#### Parameters

| Name        | Type     | Description                                               | Default       | Example                    |
| ----------- | -------- | --------------------------------------------------------- | ------------- | -------------------------- |
| prompt      | string   | The input query/content                                   | -             | "Write a poem about stars" |
| model       | string   | Target AI model (e.g., openai, mistral, searchgpt)        | openai        | mistral                    |
| seed        | integer  | Deterministic result for same input                       | random        | 123                        |
| temperature | float    | Creativity vs. determinism [0.0 - 3.0]                   | model default | 1.5                        |
| system      | string   | System prompt; instruct AI persona/behavior               | -             | "Act as a Java expert"     |
| json        | boolean  | Output in JSON format                                    | false         | true                       |
| stream      | boolean  | Stream response in real time                              | false         | true                       |

#### Example: Basic Knowledge Query (Shell)

```bash
curl "https://text.pollinations.ai/What%20is%20the%20capital%20of%20France?"
```

#### Example: Creative Prompt

```bash
curl "https://text.pollinations.ai/Write%20a%20haiku%20about%20AI?model=mistral&temperature=1.7"
```

#### Example: Python—Structured Prompt

```python
import requests
from urllib.parse import quote

prompt = "Summarize the key differences between HTTP and HTTPS"
url = f"https://text.pollinations.ai/{quote(prompt)}"
params = {"model": "openai", "temperature": 0.3}

response = requests.get(url, params=params)
print("Summary:", response.text)
```

#### Example: JavaScript (Node.js) - Custom System Prompt

```javascript
const fetch = require('node-fetch');

const system = "Act as an enthusiastic science tutor";
const prompt = "Explain Newton's third law in simple terms";
const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&system=${encodeURIComponent(system)}&temperature=0.6`;

fetch(url)
    .then(res => res.text())
    .then(console.log)
    .catch(console.error);
```

#### Example: Streaming Output (Progressive Response, Python)

```python
import requests

prompt = "Write a detailed, multi-paragraph story about a robot artist"
url = f"https://text.pollinations.ai/{prompt.replace(' ', '%20')}"
params = {"stream": True}

with requests.get(url, params=params, stream=True) as resp:
    for chunk in resp.iter_content(chunk_size=1024):
        print(chunk.decode(), end='', flush=True)
```

---

### Advanced Text Generation (OpenAI-Compatible)

```
POST https://text.pollinations.ai/openai
```

Example payload for a conversational and reasoning-driven prompt:

```json
{
  "model": "openai",
  "messages": [
    {"role": "system", "content": "You are a professional project manager."},
    {"role": "user", "content": "Draft a project timeline for a mobile app launch."}
  ],
  "temperature": 0.5,
  "max_tokens": 500,
  "reasoning_effort": "high"
}
```

**Important Reasoning Levels:**

| Level   | Description                     | Use Cases              |
| ------- | ------------------------------- | ---------------------- |
| minimal | Lowest latency, extract/format  | Data pulls, extraction |
| low     | Light reasoning                 | Factual Q&A            |
| medium  | Balanced, nuanced response      | Summaries, explanations|
| high    | Deep, strategic reasoning       | Planning, analysis     |

#### Example: Planning with High Reasoning (Shell)

```bash
curl https://text.pollinations.ai/openai \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [
      {"role": "system", "content": "You are an expert travel planner."},
      {"role": "user", "content": "Plan a 5-day Tokyo itinerary focused on technology and culture."}
    ],
    "reasoning_effort": "high",
    "temperature": 0.7
  }'
```

---

## Audio Generation API

Transform text to spoken audio or transcribe audio files.

### Text-to-Speech

```
GET https://text.pollinations.ai/{prompt}?model=openai-audio&voice={voice}
```

**Voices Available:** alloy, echo, fable, onyx, nova, shimmer

#### Example: Simple TTS (Shell)

```bash
curl -o hello.mp3 "https://text.pollinations.ai/Hello%20world?model=openai-audio&voice=nova"
```

#### Example: Python - Motivational Speech, Multiple Voices

```python
import requests
from urllib.parse import quote

text = "You are capable of amazing things!"
for voice in ["alloy", "nova"]:
    url = f"https://text.pollinations.ai/{quote(text)}"
    params = {"model": "openai-audio", "voice": voice}
    r = requests.get(url, params=params)
    with open(f"motivation_{voice}.mp3", "wb") as f:
        f.write(r.content)
    print(f"Audio saved as motivation_{voice}.mp3!")
```

#### Example: JavaScript (Node.js) - Save and Play

```javascript
const fetch = require('node-fetch');
const fs = require('fs');

const url = 'https://text.pollinations.ai/Good%20morning!%20Welcome%20to%20the%20demo?model=openai-audio&voice=fable';

fetch(url)
    .then(res => res.buffer())
    .then(buffer => fs.writeFileSync('greeting.mp3', buffer));
```

### Speech-to-Text (Audio Transcription)

```
POST https://text.pollinations.ai/openai
```

#### Example: Python

```python
import requests
import base64

with open("audio.wav", "rb") as f:
    audio_data = base64.b64encode(f.read()).decode()

payload = {
    "model": "openai-audio",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "Transcribe this meeting note:"},
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

## Vision & Multimodal API

Analyze or describe images via URL or upload.

### Supported Models

- openai
- openai-large
- claude-hybridspace

#### Example: Image Analysis via URL (Python)

```python
import requests

payload = {
    "model": "openai",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "Describe the style of this painting."},
            {
                "type": "image_url",
                "image_url": {"url": "https://www.example.com/art.jpg"}
            }
        ]
    }],
    "max_tokens": 300
}

response = requests.post("https://text.pollinations.ai/openai", json=payload)
print(response.json()['choices'][0]['message']['content'])
```

#### Example: Upload Image Data (Python)

```python
import requests
import base64

with open("landmark.jpg", "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode()

payload = {
    "model": "openai",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "What city is this?"},
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}
            }
        ]
    }]
}

response = requests.post("https://text.pollinations.ai/openai", json=payload)
print(response.json()['choices'][0]['message']['content'])
```

---

## Function Calling

Enable the AI to invoke external logic during an answer, e.g., query live data.

#### Example: Python Function Call with Simulated Weather

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
                "location": {"type": "string"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
            },
            "required": ["location"]
        }
    }
}]
payload = {
    "model": "openai",
    "messages": [{"role": "user", "content": "What's the weather in Paris today?"}],
    "tools": tools,
    "tool_choice": "auto"
}
first = requests.post("https://text.pollinations.ai/openai", json=payload).json()
tool_call = first['choices'][0]['message']['tool_calls'][0]
weather_data = '{"temperature":18,"condition":"partly cloudy","unit":"celsius"}'
final_messages = [
    {"role": "user", "content": "What's the weather in Paris today?"},
    first['choices'][0]['message'],
    {"role": "tool", "tool_call_id": tool_call['id'], "content": weather_data}
]
final = requests.post("https://text.pollinations.ai/openai", json={"model":"openai","messages":final_messages})
print(final.json()['choices'][0]['message']['content'])
```

---

## Real-time Feeds

Monitor creativity as it happens:

### Image Feed

```python
import sseclient, requests, json
resp = requests.get("https://image.pollinations.ai/feed", stream=True, headers={"Accept": "text/event-stream"})
client = sseclient.SSEClient(resp)
for event in client.events():
    data = json.loads(event.data)
    print(f"New image: {data['prompt']}\nURL: {data['imageURL']}")
```

### Text Feed

```python
import sseclient, requests, json
resp = requests.get("https://text.pollinations.ai/feed", stream=True, headers={"Accept": "text/event-stream"})
client = sseclient.SSEClient(resp)
for event in client.events():
    data = json.loads(event.data)
    print(f"Model: {data['model']}\nText: {data['response'][:100]}...")
```

---

## React Integration

Easy integration for React/Next.js applications:

### Install

```bash
npm install @pollinations/react
```

### React Hooks

```javascript
import { usePollinationsImage, usePollinationsText, usePollinationsChat } from '@pollinations/react';

// Generate image
const imageUrl = usePollinationsImage('sunset over mountains', {width: 1024, height: 1024, model: 'flux'});
// Generate text
const text = usePollinationsText('Write a limerick about engineers', {model: 'openai', seed: 101});
// Chatbot
const {messages, sendUserMessage} = usePollinationsChat([{role: 'system', content: 'You are a programming TA'}], {model: 'openai'});
```

Online playground: [react-hooks.pollinations.ai](https://react-hooks.pollinations.ai)

---

## Authentication & Rate Limits

- **Anonymous:** 1 request/15s - Test, basic usage
- **Seed:** 1 request/5s - Free registration
- **Flower:** 1 request/3s - Paid tier, advanced models
- **Nectar:** Unlimited - Enterprise custom

Register for higher quotas and greater model access at [auth.pollinations.ai](https://auth.pollinations.ai).

**Methods:**
- **Referrer:** Web apps can use the HTTP referrer header (no secret in code)
- **Bearer Token:** For backend or secure front-end

---

## Best Practices

- Use `seed` for reproducibility on text/image outputs.
- Cache and reuse results where feasible.
- Handle HTTP/network errors for robust integrations.
- Never expose Bearer tokens in front-end code; prefer `referrer` for browser use.
- Respect rate limits and backoff gracefully on 429/limit errors.

---

## Support & Resources

- [Pollinations.AI Documentation](https://github.com/pollinations/pollinations)
- [Authentication](https://auth.pollinations.ai)
- [React Playground](https://react-hooks.pollinations.ai)
- Community: Find us on X and GitHub for updates and discussion.

---

## License

**MIT License**

Feel free to adapt, share, and modify this API and its documentation. Your contributions are always welcome.

*Made with professionalism and care by the Pollinations.AI Team*

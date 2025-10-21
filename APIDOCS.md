# Pollinations API Documentation

## ✅ Overview

Pollinations is an **open AI platform** for generating **images, text, audio, and multimodal AI results** with **simple HTTP APIs**. It supports:

* ✅ No required API key for basic usage
* ✅ Supports browser apps via referrer authentication
* ✅ OpenAI-compatible `/openai` endpoint
* ✅ Image generation over simple GET URLs

---

## 🌐 API Base URLs

| Type                                  | Base URL                               |
| ------------------------------------- | -------------------------------------- |
| Image Generation                      | `https://image.pollinations.ai`        |
| Text Generation                       | `https://text.pollinations.ai`         |
| Audio (TTS / STT)                     | `https://text.pollinations.ai/openai`  |
| Multimodal / Chat (OpenAI Compatible) | `https://text.pollinations.ai/openai/` |

---

## 🚀 Quick Start

### ✅ Generate an Image

```
https://image.pollinations.ai/prompt/a%20cute%20cat%20wearing%20goggles
```

### ✅ Generate Text

```
https://text.pollinations.ai/Explain%20quantum%20physics%20simply
```

### ✅ Multimodal Chat (OpenAI-compatible)

POST `https://text.pollinations.ai/openai/`

```json
{
  "model": "openai",
  "messages": [
    {"role": "user", "content": "Tell me a bedtime story"}
  ]
}
```

---

## ✨ Features

* Text generation (chat, prompts, JSON mode, streaming)
* Image generation from text
* Image-to-image and image editing (via models like `kontext`)
* Multimodal chat (vision + audio input)
* Audio generation (TTS) and speech-to-text (STT)
* React hooks support
* OpenAI-compatible API (`/openai` endpoint)
* Function calling support
* Real-time generation feeds (image + text SSE streams)
* MCP (Model Context Protocol) server

---

## 📦 Installation (Optional SDKs)

You can use the API directly over HTTP, or optionally install helpers.

### JavaScript / Node

```bash
npm install @pollinations/react
```

### Python

```bash
pip install requests
```

*No official Python SDK yet — direct HTTP examples provided below.*

---

## 🖼️ Image Generation API

Endpoint: `GET https://image.pollinations.ai/prompt/{prompt}`

### Query Parameters

| Name       | Required | Description                                     |
| ---------- | -------- | ----------------------------------------------- |
| `prompt`   | ✅        | Text prompt (URL-encoded)                       |
| `model`    | ❌        | Image model (e.g. `flux`, `sdxl`, `darkvision`) |
| `seed`     | ❌        | Reproducible output seed                        |
| `width`    | ❌        | Width in pixels                                 |
| `height`   | ❌        | Height in pixels                                |
| `nologo`   | ❌        | Remove watermark (auth required)                |
| `private`  | ❌        | Keep output off public feed                     |
| `referrer` | ❌        | App identifier for auth                         |

✅ **Example – JavaScript**

```js
const prompt = encodeURIComponent("A futuristic samurai in neon Tokyo");
fetch(`https://image.pollinations.ai/prompt/${prompt}?model=flux&width=768&height=512`)
  .then(res => res.blob())
  .then(img => document.querySelector("img").src = URL.createObjectURL(img));
```

✅ **Example – Python**

```python
import requests, urllib
prompt = urllib.parse.quote("A futuristic samurai in neon Tokyo")
url = f"https://image.pollinations.ai/prompt/{prompt}?model=flux&width=768&height=512"
img = requests.get(url).content
open("samurai.jpg", "wb").write(img)
```

---

## 📝 Text Generation API

Endpoint: `GET https://text.pollinations.ai/{prompt}`

### Query Parameters

| Name       | Required | Description                               |
| ---------- | -------- | ----------------------------------------- |
| `prompt`   | ✅        | Text prompt                               |
| `model`    | ❌        | LLM model name (e.g. `openai`, `mistral`) |
| `json`     | ❌        | Return JSON text                          |
| `system`   | ❌        | System instruction                        |
| `stream`   | ❌        | Enable SSE streaming                      |
| `referrer` | ❌        | Browser referrer authentication           |

✅ **Example – JavaScript**

```js
fetch("https://text.pollinations.ai/Write%20a%20short%20poem%20about%20stars")
  .then(res => res.text())
  .then(console.log)
```

✅ **Example – Python**

```python
import requests
print(requests.get("https://text.pollinations.ai/Write%20a%20short%20poem").text)
```

---

## 🤖 Multimodal & Chat (OpenAI Compatible)

Endpoint: `POST https://text.pollinations.ai/openai/`

Supports:
✅ Chat ✅ Vision input ✅ Audio input ✅ Streaming ✅ Function calling ✅ JSON Mode ✅ Reasoning Mode

✅ **Example Chat Completion**

```json
{
  "model": "openai",
  "messages": [{"role": "user", "content": "Tell me a bedtime story."}]
}
```

✅ **Vision Example**

```json
{
  "model": "openai",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "Describe this image"},
      {"type": "image_url", "image_url": {"url": "https://example.com/cat.png"}}
    ]
  }]
}
```

---

## 🔊 Audio API (Text-to-Speech & Speech-to-Text)

Pollinations supports audio generation (TTS) and speech recognition (STT) via the **text API**.

### ✅ Text-to-Speech (TTS)

Generate speech audio from a text prompt.

**Endpoint:** `GET https://text.pollinations.ai/{prompt}?model=openai-audio&voice={voice}`

| Parameter | Required | Description                              |
| --------- | -------- | ---------------------------------------- |
| `prompt`  | ✅        | Text to convert to speech                |
| `model`   | ✅        | Must be `openai-audio`                   |
| `voice`   | ❌        | Voice ID (e.g. `alloy`, `nova`, `fable`) |

**JavaScript Example**

```js
const prompt = encodeURIComponent("Hello from Pollinations text to speech!");
fetch(`https://text.pollinations.ai/${prompt}?model=openai-audio&voice=nova`)
  .then(res => res.blob())
  .then(audio => new Audio(URL.createObjectURL(audio)).play());
```

**Python Example**

```python
import requests, urllib
text = urllib.parse.quote("Hello from Pollinations!")
url = f"https://text.pollinations.ai/{text}?model=openai-audio&voice=fable"
open("tts.mp3", "wb").write(requests.get(url).content)
```

---

### 🗣️ Speech-to-Text (STT)

Speech recognition is available via the OpenAI-compatible API.

**Endpoint:** `POST https://text.pollinations.ai/openai/`

```json
{
  "model": "openai-audio",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "input_audio", "input_audio": { "data": "<base64-audio>", "format": "wav" } }
      ]
    }
  ]
}
```

---

## 🔁 Streaming Responses

Pollinations supports **Server-Sent Events (SSE)** for both text and chat streaming.

Enable streaming with `stream: true` (POST) or `?stream=true` (GET).

**Streaming Text Example (GET)**

```bash
curl -N "https://text.pollinations.ai/Write%20a%20long%20story?stream=true"
```

**Streaming Chat Example (POST)**

```bash
curl -N https://text.pollinations.ai/openai/ \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "stream": true,
    "messages": [{"role": "user", "content": "Write a poem one line at a time"}]
  }'
```

---

## 🔐 Authentication

Pollinations supports two authentication methods so you can use it from **both frontend and backend apps**.

### ✅ Option 1: Referrer Authentication (Frontend, No API Key)

Best for **web apps hosted on a domain**. Authenticate by including your domain name in the request.

```
https://image.pollinations.ai/prompt/cat?referrer=mywebsite.com
```

```
https://text.pollinations.ai/Hello?referrer=myapp.net
```

✅ **Pros:** Easiest, safe for frontend, no secrets
❗ **Note:** Must run from a real domain (not localhost)

---

### ✅ Option 2: Bearer Token (Backend or Secure Apps)

Get a token from your dashboard or self-host instance.

**Example (JavaScript):**

```js
fetch("https://text.pollinations.ai/Hello", {
  headers: { "Authorization": `Bearer YOUR_TOKEN_HERE` }
})
```

**Example (Python):**

```python
import requests
requests.get(
  "https://text.pollinations.ai/Hello",
  headers={"Authorization": "Bearer YOUR_TOKEN_HERE"}
)
```

---

### 🔒 Private Output

Make generations private (not shown in public feed):

```
https://image.pollinations.ai/prompt/cat?private=true&referrer=myapp.com
```

---

## 🧩 Function Calling

Define tools for the model to call structured functions.

```json
{
  "model": "openai",
  "messages": [{"role": "user", "content": "What is the weather in Tokyo?"}],
  "functions": [
    {
      "name": "get_weather",
      "description": "Get weather info by city",
      "parameters": {
        "type": "object",
        "properties": {
          "city": { "type": "string" }
        },
        "required": ["city"]
      }
    }
  ]
}
```

---

## 🧠 Reasoning Mode

Improve chain-of-thought depth with `reasoning_effort`:

```
  "reasoning_effort": 0.7
```

Use values from `0.1`–`1.0` (higher = more detailed reasoning).

---

## 🗄️ Backend Integration (Node.js Example)

You can safely call Pollinations from your backend using **Bearer tokens** or keep it unauthed for simple use.

### ✅ Example: Node.js Express Image Proxy

```js
import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/api/generate-image", async (req, res) => {
  const prompt = encodeURIComponent("A robot chef making noodles");
  const pollinationsURL = `https://image.pollinations.ai/prompt/${prompt}`;

  const response = await fetch(pollinationsURL);
  const buffer = await response.arrayBuffer();

  res.setHeader("Content-Type", "image/jpeg");
  res.send(Buffer.from(buffer));
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
```

### ✅ Example: Node.js Backend Chat

```js
import fetch from "node-fetch";

const response = await fetch("https://text.pollinations.ai/openai/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "openai",
    messages: [{ role: "user", content: "Give me 3 startup ideas." }]
  })
});

console.log(await response.json());
```
# Pollinations README – Part 2 (React, Feeds, Errors, Limits, Best Practices)

This continues from Part 1. Will be merged later.

---

## ⚛️ React Integration (`@pollinations/react`)

Pollinations provides React hooks to easily generate AI images and text directly in your components.

### ✅ Install

```bash
npm install @pollinations/react
```

### ✅ Image Generation Example

```jsx
import { usePollinationsImage } from "@pollinations/react";

export default function App() {
  const imageUrl = usePollinationsImage("A cyberpunk cat DJ", {
    width: 512,
    height: 512
  });

  return <img src={imageUrl} alt="Generated AI" />;
}
```

### ✅ Text Generation Example

```jsx
import { usePollinationsText } from "@pollinations/react";

export default function Quote() {
  const text = usePollinationsText("Write a short motivational quote.");
  return <p>{text}</p>;
}
```

---

---

## ⚡ Next.js Integration

You can also build with Pollinations in a fullstack **Next.js app** using both **browser referrer mode** and **API routes** for secure backend usage.

### ✅ Quick Setup

```bash
npx create-next-app pollinations-app
cd pollinations-app
npm install @pollinations/react
```

### ✅ `/app/page.jsx`

```jsx
import Image from "next/image";
import { usePollinationsImage, usePollinationsText } from "@pollinations/react";

export default function Home() {
  const img = usePollinationsImage("A dragon made of galaxies", { width: 512 });
  const text = usePollinationsText("Explain black holes in 2 sentences.");

  return (
    <main>
      <h1>Pollinations + Next.js</h1>
      <Image src={img} alt="AI" width={512} height={512} />
      <p>{text}</p>
    </main>
  );
}
```

---

### 🔒 Backend Chat Route Example

Create a secure AI route at `/app/api/chat/route.js`:

```js
// app/api/chat/route.js
export async function POST(req) {
  const body = await req.json();

  const response = await fetch("https://text.pollinations.ai/openai/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" }
  });
}
```

Usage from frontend:

```js
await fetch("/api/chat", {
  method: "POST",
  body: JSON.stringify({
    model: "openai",
    messages: [{ role: "user", content: "Write a haiku" }]
  })
});
```

---

---

## 🔴 Real-Time Generation Feeds (Streaming Images & Text)

Pollinations supports **live generation previews** using **Server-Sent Events (SSE)**.

### ✅ Live Image Generation Feed

Subscribe to images being generated live across Pollinations:

```bash
curl https://image.pollinations.ai/feed
```

Or in JavaScript:

```js
const feed = new EventSource("https://image.pollinations.ai/feed");
feed.onmessage = event => console.log("New Image:", event.data);
```

---

### ✅ Live Text Feed (LLM Stream)

You can subscribe to text generation events too:

```bash
curl https://text.pollinations.ai/feed
```

JS Example:

```js
const stream = new EventSource("https://text.pollinations.ai/feed");
stream.onmessage = e => console.log("New Text:", e.data);
```

---

## 🚨 Error Handling

Common HTTP status codes returned by Pollinations APIs:

| Code | Meaning         | Fix                                 |
| ---- | --------------- | ----------------------------------- |
| 400  | Invalid request | Check parameters or prompt encoding |
| 401  | Unauthorized    | Add `referrer` or Bearer token      |
| 403  | Forbidden       | Wrong auth or private resource      |
| 429  | Rate limited    | Add retry logic or reduce frequency |
| 500  | Server error    | Retry with backoff                  |

Example handling in JS:

```js
fetch(url).then(res => {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
});
```

---

## ⏳ Rate Limits

Pollinations is free to use, but requests may be rate-limited.

| Tier             | Limit                 |
| ---------------- | --------------------- |
| Public (no auth) | Fair-use limits       |
| Referrer auth    | Higher safety + usage |
| Bearer Token     | Best reliability      |

Check rate limit headers in responses:

```
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
```

---

## ✅ Best Practices

✔️ Use `referrer` for frontend apps (safe, no secrets)
✔️ Use backend proxy for commercial/secure apps
✔️ Always URL-encode prompts
✔️ Compress audio/images sent to `/openai`
✔️ Cache generated results when possible
✔️ Use `private=true` for hidden generations

---

## 🔐 Security Notes (Browser Apps)

⚠️ Never expose Bearer tokens in frontend code.
✅ Use `referrer=myapp.com` for public browser apps.
✅ Use backend `/api/*` routes to hide secrets.
✅ Validate user input if you proxy requests.

---

## ✅ Final README Structure

This documentation will be merged into a final single README with:

* ✅ Overview
* ✅ Quick Start
* ✅ Installation
* ✅ Image API
* ✅ Text API
* ✅ Multimodal API
* ✅ Audio API
* ✅ Streaming
* ✅ Authentication
* ✅ Function Calling
* ✅ Reasoning Mode
* ✅ Node Backend
* ✅ React Hooks
* ✅ Next.js
* ✅ Feeds
* ✅ Errors & Limits
* ✅ Best Practices
* ✅ License + Contributing

---

## 🧠 FAQ

**Q: Do I need an API key?**
A: No! You can use `referrer=` for browser apps or Bearer tokens for backend.

**Q: Can I use this from frontend JavaScript?**
A: Yes, just include `?referrer=yourdomain.com`.

**Q: Are results public?**
A: By default yes, unless you add `private=true`.

**Q: Does it support streaming?**
A: Yes, both `/text` and `/openai` support `stream=true`.

---

## 🧩 Model List

| Type      | Model          | Notes                      |
| --------- | -------------- | -------------------------- |
| Text      | `openai`       | GPT-5 model                |
| Text      | `mistral`      | Lightweight alt            |
| Image     | `flux`         | Great creative quality     |
| Image     | `turbo`        | Balanced realism           |
| Image     | `seedream`     | Image editing and image creation in one        |
| Audio TTS | `openai-audio` | Voices: nova, alloy, verse |

---

## 📊 Parameter Reference

### Image API Parameters

| Name     | Description         | Example          |
| -------- | ------------------- | ---------------- |
| `prompt` | Text prompt         | `a flying robot` |
| `width`  | Image width         | `512`            |
| `height` | Image height        | `768`            |
| `model`  | Model choice        | `flux`           |
| `seed`   | Reproducible output | `42`             |

### Text API Parameters

| Name     | Description        |
| -------- | ------------------ |
| `system` | System instruction |
| `json`   | Force JSON output  |
| `stream` | Enable SSE         |

---

## 🔧 cURL Examples

### Image

```bash
curl "https://image.pollinations.ai/prompt/A%20forest%20in%20fog?model=flux&width=512&height=512"
```

### Text

```bash
curl "https://text.pollinations.ai/Write%20me%20a%20tweet%20about%20AI"
```

### Chat (OpenAI compatible)

```bash
curl https://text.pollinations.ai/openai/ \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [{"role": "user", "content": "Tell me a story"}]
  }'
```

### Thank you for using the Pollinations API!

# @pollinations/react

React hooks for [Pollinations AI](https://pollinations.ai) — Generate images, text, video & chat with one import.

[![npm version](https://img.shields.io/npm/v/@pollinations/react.svg)](https://www.npmjs.com/package/@pollinations/react)
[![license](https://img.shields.io/npm/l/@pollinations/react.svg)](https://github.com/pollinations/pollinations/blob/main/LICENSE)

## Installation

```bash
npm install @pollinations/react
```

## Quick Start

```tsx
import {
    usePollinationsText,
    usePollinationsImage,
    usePollinationsVideo,
    usePollinationsChat,
    usePollinationsModels,
} from "@pollinations/react";

function App() {
    const { data: text, isLoading: textLoading } = usePollinationsText(
        "Write a haiku about AI",
        { apiKey: "pk_..." }
    );
    const {
        data: imageUrl,
        isLoading: imageLoading,
        error: imageError,
    } = usePollinationsImage("A beautiful sunset", { apiKey: "pk_..." });
    const {
        data: videoUrl,
        isLoading: videoLoading,
        error: videoError,
    } = usePollinationsVideo("A cat walking in rain", {
        model: "veo",
        duration: 4,
        apiKey: "pk_...",
    });
    const {
        sendMessage,
        messages,
        isLoading: chatLoading,
    } = usePollinationsChat([{ role: "system", content: "You are helpful" }]);
    const { models, isLoading: modelsLoading } = usePollinationsModels("text");

    return (
        <div>
            <h2>Text</h2>
            {textLoading ? <p>Loading...</p> : <p>{text}</p>}

            <h2>Image</h2>
            {imageLoading ? (
                <p>Generating image...</p>
            ) : (
                <img src={imageUrl} alt="Generated" />
            )}

            <h2>Video</h2>
            {videoLoading ? (
                <p>Generating video...</p>
            ) : (
                <video src={videoUrl} controls />
            )}

            <h2>Chat</h2>
            <button onClick={() => sendMessage("Hello!")}>Send Hello</button>
            <ul>
                {messages.map((msg, i) => (
                    <li key={i}>
                        <b>{msg.role}:</b> {msg.content}
                    </li>
                ))}
            </ul>

            <h2>Models</h2>
            {modelsLoading ? (
                <p>Loading models...</p>
            ) : (
                <pre>{JSON.stringify(models, null, 2)}</pre>
            )}
        </div>
    );
}
```

## Hooks

### `usePollinationsText`

Generate text using AI models.

```tsx
const { data, isLoading, error } = usePollinationsText(prompt, {
    model: "openai", // default
    seed: 42, // for reproducibility
    systemPrompt: "...", // optional system prompt
    json: false, // parse response as JSON
    apiKey: "pk_...", // optional API key
});
```

-   `data`: string | object (if `json` is true)
-   `isLoading`: boolean
-   `error`: Error | null

### `usePollinationsImage`

Generate image URLs.

```tsx
const { data, isLoading, error } = usePollinationsImage(prompt, {
    model: "flux", // default
    width: 1024,
    height: 1024,
    seed: 42,
    nologo: true,
    enhance: false,
    apiKey: "pk_...", // required
});
```

-   `data`: string (blob URL) or null
-   `isLoading`: boolean
-   `error`: Error | null

### `usePollinationsVideo`

Generate videos.

```tsx
const { data, isLoading, error } = usePollinationsVideo(prompt, {
    model: "veo", // or "seedance", "seedance-pro"
    duration: 4, // 1-10 seconds (veo: 4, 6, 8)
    aspectRatio: "16:9", // or "9:16"
    seed: 42,
    audio: false, // veo only
    nologo: true,
    apiKey: "pk_...", // required
});
```

-   `data`: string (blob URL) or null
-   `isLoading`: boolean
-   `error`: Error | null

### `usePollinationsChat`

Multi-turn chat conversations.

```tsx
const { sendMessage, messages, isLoading, error, reset } = usePollinationsChat(
    [
        { role: "system", content: "You are helpful" },
        // ...other initial messages
    ],
    {
        model: "openai", // default
        apiKey: "pk_...",
    }
);

// Send a message
sendMessage("Hello!");

// Reset conversation
reset();
```

-   `messages`: Array of `{ role: string, content: string }`
-   `sendMessage`: (message: string) => void
-   `isLoading`: boolean
-   `error`: Error | null
-   `reset`: () => void

### `usePollinationsModels`

Fetch available models.

```tsx
const { models, isLoading, error } = usePollinationsModels("text"); // or "image" or "video"
```

-   `models`: Array of model objects
-   `isLoading`: boolean
-   `error`: Error | null

## Authentication

Get your API key at [enter.pollinations.ai](https://enter.pollinations.ai).

| Key Type        | Prefix   | Use Case                         |
| --------------- | -------- | -------------------------------- |
| **Publishable** | `pk_...` | Client-side, rate limited        |
| **Secret**      | `sk_...` | Server-side only, no rate limits |

All hooks use `gen.pollinations.ai` endpoints with the following patterns:
- **Text**: `GET /text/{prompt}` with query parameters (seed, model, json, system_prompt)
- **Chat**: `POST /v1/chat/completions` with message array
- **Image**: `GET /image/{prompt}` with query parameters (width, height, seed, model, nologo, enhance)
- **Video**: `GET /video/{prompt}` with query parameters (model, duration, aspectRatio, seed, audio, nologo)
- **Models**: `GET /text/models`, `GET /image/models`, or `GET /video/models`

## Links

-   [Pollinations.ai](https://pollinations.ai)
-   [API Docs](https://enter.pollinations.ai/api/docs)
-   [Discord](https://discord.gg/pollinations)
-   [GitHub](https://github.com/pollinations/pollinations)

## License

MIT [Pollinations.AI](https://pollinations.ai)


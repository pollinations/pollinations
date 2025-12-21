# @pollinations/react

React hooks for [Pollinations AI](https://pollinations.ai) — Generate images, text & chat with one import.

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
    usePollinationsChat,
    usePollinationsModels,
} from "@pollinations/react";

function App() {
    const { data: text, isLoading: textLoading } = usePollinationsText(
        "Write a haiku about AI"
    );
    const {
        data: imageUrl,
        isLoading: imageLoading,
        error: imageError,
    } = usePollinationsImage("A beautiful sunset", { apiKey: "pk_..." });
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
    jsonMode: false, // parse response as JSON
    apiKey: "pk_...", // optional API key
});
```

-   `data`: string | object (if `jsonMode` is true)
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
const { models, isLoading, error } = usePollinationsModels("text"); // or "image"
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

See [CHANGELOG.md](./CHANGELOG.md) for full migration guide.

## Links

-   [Pollinations.ai](https://pollinations.ai)
-   [API Docs](https://enter.pollinations.ai/api/docs)
-   [Discord](https://discord.gg/pollinations)
-   [GitHub](https://github.com/pollinations/pollinations)

## License

MIT [Pollinations.AI](https://pollinations.ai)

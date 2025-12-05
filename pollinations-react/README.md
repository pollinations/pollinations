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
import { usePollinationsText, usePollinationsImage } from "@pollinations/react";

function App() {
    const { data: text, isLoading } = usePollinationsText(
        "Write a haiku about AI"
    );
    const imageUrl = usePollinationsImage("A beautiful sunset");

    return (
        <div>
            {isLoading ? <p>Loading...</p> : <p>{text}</p>}
            <img src={imageUrl} alt="Generated" />
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

### `usePollinationsImage`

Generate image URLs.

```tsx
const imageUrl = usePollinationsImage(prompt, {
    model: "flux", // default
    width: 1024,
    height: 1024,
    seed: 42,
    nologo: true,
    enhance: false,
    apiKey: "pk_...",
});
```

### `usePollinationsChat`

Multi-turn chat conversations.

```tsx
const { sendMessage, messages, isLoading, error, reset } = usePollinationsChat(
    [{ role: "system", content: "You are helpful" }],
    { model: "openai", apiKey: "pk_..." }
);

// Send a message
sendMessage("Hello!");

// Reset conversation
reset();
```

### `usePollinationsModels`

Fetch available models.

```tsx
const { models, isLoading, error } = usePollinationsModels("text"); // or "image"
```

## Authentication

Get your API key at [enter.pollinations.ai](https://enter.pollinations.ai).

| Key Type        | Prefix   | Use Case                         |
| --------------- | -------- | -------------------------------- |
| **Publishable** | `pk_...` | Client-side, rate limited        |
| **Secret**      | `sk_...` | Server-side only, no rate limits |

## Migration from v2.x

### Breaking Changes in v3.0

1. **New return shape** for `usePollinationsText`:

```tsx
// v2.x
const text = usePollinationsText("prompt");

// v3.x
const { data, isLoading, error } = usePollinationsText("prompt");
```

2. **New method** in `usePollinationsChat` (old method still works):

```tsx
// v2.x (still works)
sendUserMessage("Hello");

// v3.x (preferred)
sendMessage("Hello");
```

3. **New features**: `isLoading`, `error`, `reset()` on chat hook

See [CHANGELOG.md](./CHANGELOG.md) for full migration guide.

## Links

-   [Pollinations.ai](https://pollinations.ai)
-   [API Docs](https://enter.pollinations.ai/api/docs)
-   [Discord](https://discord.gg/pollinations)
-   [GitHub](https://github.com/pollinations/pollinations)

## License

MIT [Pollinations.AI](https://pollinations.ai)

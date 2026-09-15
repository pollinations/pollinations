# Quick Integration

### Raw HTTP

Standard tier requests do not require signup or authentication.

#### Image Generation
```bash
# Direct GET returning raw image bytes
curl -o sample.jpg "https://gen.pollinations.ai/image/a%20cyberpunk%20garden?width=1024&height=1024&seed=42"
```

#### Text Generation
```bash
# OpenAI-compatible completions endpoint
curl -X POST "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "openai",
    "messages": [
      {"role": "user", "content": "Explain quantum computing in two sentences."}
    ]
  }'
```

### Official SDK (`@pollinations/sdk`)

#### Vanilla JavaScript
```javascript
import { generateImage, generateText } from "@pollinations/sdk";

const imageUrl = await generateImage("a cinematic forest", {
    width: 1024,
    height: 1024,
    seed: 1234
});

const text = await generateText("Summarise modern distributed systems.", {
    model: "openai"
});
```

#### React Hook
```tsx
import { usePollinationsImage } from "@pollinations/sdk";

export function ArtFrame() {
    const { url, loading, error } = usePollinationsImage("abstract oil painting", {
        width: 800,
        height: 600
    });

    if (loading) return <div>Generating...</div>;
    if (error) return <div>Generation failed</div>;
    return <img src={url} alt="Generated output" />;
}
```

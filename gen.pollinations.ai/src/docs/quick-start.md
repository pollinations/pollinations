## Quick Start

### Text (Python, OpenAI SDK)

```python
from openai import OpenAI
client = OpenAI(base_url="https://gen.pollinations.ai/v1", api_key="YOUR_API_KEY")
response = client.chat.completions.create(model="openai", messages=[{"role": "user", "content": "Hello!"}])
print(response.choices[0].message.content)
```

### Image (URL — no code needed)

```
https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux
```

### Audio (cURL)

```bash
curl "https://gen.pollinations.ai/audio/Hello%20world?voice=nova" \
  -H "Authorization: Bearer YOUR_API_KEY" -o speech.mp3
```

### Embeddings (OpenAI-compatible)

```bash
curl https://gen.pollinations.ai/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai-3-small","input":"Hello world","dimensions":512}'
```

See `GET /v1/models` for every text, image, audio, video, and embedding model available.

## Quick Start

```python
from openai import OpenAI
client = OpenAI(base_url="https://gen.pollinations.ai", api_key="YOUR_API_KEY")
response = client.chat.completions.create(model="openai", messages=[{"role": "user", "content": "Hello!"}])
print(response.choices[0].message.content)
```

Image generation works without any SDK — just open the URL:

```
https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux
```

See `GET /v1/models` for every text, image, audio, video, and embedding model available.

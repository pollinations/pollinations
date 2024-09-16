# Pollinations.AI Image Generation API

## Endpoint
```
GET https://image.pollinations.ai/prompt/{prompt}
```

## Description
This endpoint generates an image based on the provided prompt and optional parameters. It returns a raw image file (typically JPEG or PNG).

## Parameters

| Parameter | Type     | Description                                                                               | Default |
|-----------|----------|-------------------------------------------------------------------------------------------|---------|
| prompt    | required | Text description of the image you want to generate. Should be URL-encoded.                | -       |
| model     | optional | Model to use for generation. See https://image.pollinations.ai/models for available models. | 'turbo' |
| seed      | optional | Seed for reproducible results. Use -1 for random.                                         | random  |
| width     | optional | Width of the generated image.                                                             | 1024    |
| height    | optional | Height of the generated image.                                                            | 1024    |
| nologo    | optional | Set to 'true' to turn off the rendering of the logo.                                      | false   |
| nofeed    | optional | Set to 'true' to prevent the image from appearing in the public feed.                     | false   |
| enhance   | optional | Set to 'true' to turn on prompt enhancing (passes prompts through an LLM to add detail).  | false   |

## Example Usage
```
https://image.pollinations.ai/prompt/A%20beautiful%20sunset%20over%20the%20ocean?model=flux&width=1280&height=720&seed=42&nologo=true
```

## Code Examples

### Python
```python
import requests

def download_image(prompt, width=768, height=768, model='flux', seed=-1):
    url = f"https://image.pollinations.ai/prompt/{prompt}?width={width}&height={height}&model={model}&seed={seed}&nologo=true"
    response = requests.get(url)
    with open('generated_image.jpg', 'wb') as file:
        file.write(response.content)
    print('Image downloaded!')

download_image("A beautiful sunset over the ocean", width=1280, height=720, model='flux', seed=42)
```

### JavaScript (Node.js)
```javascript
import fetch from 'node-fetch';
import fs from 'fs';

async function downloadImage(prompt, width = 1024, height = 1024, model = 'turbo', seed = -1) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true`;
  const response = await fetch(url);
  const buffer = await response.buffer();
  fs.writeFileSync('generated_image.jpg', buffer);
  console.log('Image downloaded!');
}

downloadImage("A beautiful sunset over the ocean", 1280, 720, 'flux', 42);
```

### HTML
```html
<img src="https://image.pollinations.ai/prompt/A%20beautiful%20sunset%20over%20the%20ocean?width=1280&height=720&model=flux&seed=42&nologo=true" alt="AI-generated sunset">
```

## Integration Examples

- Web Design: `<img src="https://image.pollinations.ai/prompt/Modern%20minimalist%20logo?nologo=true" alt="AI-generated logo">`
- E-learning: Generate custom illustrations for concepts
- Chatbots: Enhance responses with relevant images
- Social Media: Create engaging visual content on-the-fly

For more examples and community projects, visit our [GitHub repository](https://github.com/pollinations/pollinations).

## Text Generation API

In addition to our image generation API, we also offer a text generation API. This API allows you to generate text responses based on prompts using AI.

### Endpoint
```
GET https://text.pollinations.ai/{prompt}
POST https://text.pollinations.ai/
```

### Description
This endpoint generates text responses based on the provided prompt using AI. It returns a text response.

### Parameters (GET request)

| Parameter | Type     | Description                                                | Default |
|-----------|----------|------------------------------------------------------------|---------|
| prompt    | required | Text prompt for the AI to respond to. Should be URL-encoded. | -       |
| seed      | optional | Seed for reproducible results. Use -1 for random.          | null    |
| json      | optional | Set to 'true' to receive response in JSON format.          | false   |

### Request Body (POST request)

| Field    | Type     | Description                                                |
|----------|----------|------------------------------------------------------------|
| messages | required | Array of message objects with 'role' and 'content' fields. |
| seed     | optional | Seed for reproducible results. Use -1 for random.          |
| jsonMode | optional | Set to true to receive response in JSON format.            |

### Example Usage (GET)
```
https://text.pollinations.ai/What%20is%20artificial%20intelligence?seed=42&json=true
```

### Example Usage (POST)
```javascript
const fetch = require('node-fetch');

async function generateText() {
  const response = await fetch('https://text.pollinations.ai/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is artificial intelligence?' }
      ],
      seed: 42,
      jsonMode: true
    }),
  });

  const data = await response.json();
  console.log(data);
}

generateText();
```

Note: The message format used in the POST request is similar to the one used by OpenAI's ChatGPT API. For more detailed information on structuring your messages, please refer to the [OpenAI API documentation](https://platform.openai.com/docs/guides/chat).
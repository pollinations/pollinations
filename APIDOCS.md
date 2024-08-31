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
| model     | optional | Model to use for generation. Options: 'flux' or 'turbo'.                                  | 'turbo' |
| seed      | optional | Seed for reproducible results. Use -1 for random.                                         | random  |
| width     | optional | Width of the generated image.                                                             | 1024    |
| height    | optional | Height of the generated image.                                                            | 1024    |
| nologo    | optional | Set to 'true' to turn off the rendering of the logo.                                      | false   |
| nofeed    | optional | Set to 'true' to prevent the image from appearing in the public feed.                     | false   |
| enhance   | optional | Set to 'true' to turn on prompt enhancing (passes prompts through an LLM to add detail).  | false   |

## Example Usage
```
https://image.pollinations.ai/prompt/A%20beautiful%20sunset%20over%20the%20ocean?model=flux&width=1280&height=720&seed=42&nologo=true&enhance=true
```

## Code Examples

### Python
```python
import requests

def download_image(prompt, width=1024, height=1024, model='turbo', seed=-1):
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
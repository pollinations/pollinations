# Pollinations.AI API Docs 🌸
## The World's Most Accessible Open GenAI Platform

Create amazing text, images, and audio with our APIs—no signup required to get started! 🚀  
Think of Pollinations.AI as a digital garden where you can plant a "seed" (your idea) and watch it grow into text, images, or audio with the help of AI. Our APIs are like tools in your gardening shed—easy to use, powerful, and ready to help you create something beautiful.

## Quick Start
Ready to dive in? Here are some live examples you can try right in your browser to see what Pollinations.AI can do:

- 🖼️ **Create an Image**: Generate a logo for Pollinations.AI [pollinations_logo](https://image.pollinations.ai/prompt/pollinations_logo)
- 💬 **Generate Text**: Learn why donating to Pollinations.AI is a great idea [why_you_should_donate](https://text.pollinations.ai/why_you_should_donate)
- 🔍 **Search the Web**: Find the latest news about Pollinations.AI [latest_news](https://text.pollinations.ai/latest_news?model=gemini-search)
- 🎙️ **Create Audio**: Hear a fun, short hypnosis audio encouraging a donation (just for laughs!) [hypnosis_audio](https://text.pollinations.ai/hypnosis_audio?model=openai-audio&voice=nova)

**How to Try These**: Just click the links above, and you’ll see the results instantly in your browser. No coding needed yet!

## Table of Contents
- [Image Generation API](#image-generation-api)
- [Text Generation API](#text-generation-api)
- [Audio Generation API](#audio-generation-api)
- [Vision & Multimodal](#vision--multimodal)
- [Function Calling](#function-calling)
- [Real-time Feeds](#real-time-feeds)
- [React Integration](#react-integration)
- [Authentication & Rate Limits](#authentication--rate-limits)
- [Advanced Features](#advanced-features)
- [Best Practices](#best-practices)
- [Support & Resources](#support--resources)

## Image Generation API
The Image Generation API lets you turn words into pictures. Imagine describing a scene to an artist, and they paint it for you—that’s what this API does, but with AI!

### Generate an Image
**Endpoint**: `GET https://image.pollinations.ai/prompt/{prompt}`  
This endpoint takes a text description (called a "prompt") and creates an image based on it. For example, you could say "a cat wearing sunglasses," and the API will generate a picture of that.

#### Parameters
Here’s what you can customize when generating an image:

| Parameter | Type   | Description                                      | Default | Example                     |
|-----------|--------|--------------------------------------------------|---------|-----------------------------|
| prompt    | string | The description of the image (required)          | -       | "a fluffy dog in a forest"  |
| model     | string | The AI model to use (e.g., flux, turbo)          | flux    | turbo                       |
| width     | integer| Image width in pixels                            | 1024    | 1920                        |
| height    | integer| Image height in pixels                           | 1024    | 1080                        |
| seed      | integer| A number to get the same image every time        | random  | 12345                       |
| nologo    | boolean| Remove the Pollinations watermark (needs account)| false   | true                        |
| enhance   | boolean| Let AI improve your prompt for better results    | false   | true                        |
| private   | boolean| Hide the image from public feeds                 | false   | true                        |

**Analogy**: Think of the prompt as the main idea for your painting, while parameters like width and height are like choosing the size of the canvas. The seed is like telling the artist to paint the same picture again if you give them the same number.

#### Examples

##### Simple Image (Command Line)
Want a picture of a sunset? Use this command in your terminal:
```bash
curl -o sunset.jpg "https://image.pollinations.ai/prompt/beautiful%20sunset%20over%20ocean"
```

**What’s Happening?**
- `curl` is a tool to make web requests.
- `-o sunset.jpg` saves the image as a file named `sunset.jpg`.
- The `%20` in the URL is how spaces are encoded (e.g., "beautiful sunset" becomes `beautiful%20sunset`).
- Run this, and you’ll get a stunning sunset image saved to your computer!

##### Customized Image (Command Line)
Let’s create a high-resolution cyberpunk city image with a specific seed for consistency:
```bash
curl -o city.jpg "https://image.pollinations.ai/prompt/cyberpunk%20city%20at%20night?width=1920&height=1080&seed=42&model=flux"
```

**What’s Happening?**
- `width=1920&height=1080` makes a Full HD image.
- `seed=42` ensures you get the same city every time you run this.
- `model=flux` uses a specific AI model for better quality.

##### Python Example
Here’s how to generate an image using Python, perfect for automating tasks:
```python
import requests
from urllib.parse import quote

# Your idea for the image
prompt = "A serene mountain landscape at sunrise"
# Encode the prompt to handle spaces
url = f"https://image.pollinations.ai/prompt/{quote(prompt)}"
# Customize the image size and model
params = {"width": 1280, "height": 720, "model": "flux"}

# Make the request
response = requests.get(url, params=params, timeout=60)
# Save the image to a file
with open("mountain.jpg", "wb") as f:
    f.write(response.content)

print("Image saved as mountain.jpg!")
```

**What’s Happening?**
- `quote(prompt)` converts spaces to `%20` for the URL.
- `requests.get` sends the request to the API.
- The image is saved as `mountain.jpg` in your current directory.
- Try changing the prompt to something like "a dragon flying over a castle"!

##### JavaScript Example (Node.js)
If you prefer JavaScript, here’s how to do it:
```javascript
const fetch = require('node-fetch');
const fs = require('fs');

const prompt = "A futuristic city with flying cars";
const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720&model=flux`;

fetch(url)
    .then(response => response.buffer())
    .then(buffer => {
        fs.writeFileSync('city.jpg', buffer);
        console.log('Image saved as city.jpg!');
    })
    .catch(error => console.error('Error:', error));
```

**What’s Happening?**
- `encodeURIComponent` is JavaScript’s version of Python’s `quote`.
- `fetch` grabs the image from the API.
- The image is saved as `city.jpg`.

### List Available Models
**Endpoint**: `GET https://image.pollinations.ai/models`  
Want to know which AI models you can use for images? This endpoint lists them.

**Example (Command Line)**:
```bash
curl https://image.pollinations.ai/models
```

**What You’ll Get**: A list like `["flux", "turbo", "stable-diffusion"]`, showing the available models.

## Text Generation API
The Text Generation API is like having a super-smart assistant who can answer questions, write stories, or explain complex ideas based on your prompts.

### Simple Text Generation
**Endpoint**: `GET https://text.pollinations.ai/{prompt}`  
This endpoint takes a text prompt and returns a response, like asking a question or requesting a story.

#### Parameters
| Parameter   | Type   | Description                                    | Default       | Example                     |
|-------------|--------|------------------------------------------------|---------------|-----------------------------|
| prompt      | string | Your question or task (required)               | -             | "Write a poem about stars"  |
| model       | string | The AI model to use                            | openai        | mistral                     |
| seed        | integer| For consistent responses                        | random        | 123                         |
| temperature | float  | Controls creativity (0.0=strict, 3.0=wild)     | model default | 1.5                         |
| system      | string | Instructions for the AI’s behavior              | -             | "Act like a pirate"         |
| json        | boolean| Get response in JSON format                    | false         | true                        |
| stream      | boolean| Get response in real-time chunks               | false         | true                        |

**Analogy**: The prompt is your question to a wise librarian. The temperature is like telling them how creative to be—low for a straightforward answer, high for a wild, imaginative one. The system parameter is like giving the librarian a personality, like "answer as if you’re a pirate."

#### Examples
##### Basic Query (Command Line)
Ask a simple question:
```bash
curl "https://text.pollinations.ai/What%20is%20the%20capital%20of%20France?"
```

**What’s Happening?**
- You’ll get a response like: *The capital of France is Paris.*
- The prompt is URL-encoded (`%20` for spaces).

##### Creative Text (Command Line)
Generate a haiku with some creativity:
```bash
curl "https://text.pollinations.ai/Write%20a%20haiku%20about%20AI?model=mistral&temperature=1.5"
```

**What’s Happening?**
- `model=mistral` uses a different AI model for variety.
- `temperature=1.5` makes the haiku more creative and poetic.

##### Python Example
Ask for a simple explanation of a complex topic:
```python
import requests
from urllib.parse import quote

# Your question
prompt = "Explain quantum computing simply"
url = f"https://text.pollinations.ai/{quote(prompt)}"
params = {"model": "openai", "temperature": 0.7}

# Get the response
response = requests.get(url, params=params)
print(response.text)
```

**What’s Happening?**
- The API returns a clear explanation, like: *Quantum computing uses quantum bits, or qubits, which can be 0, 1, or both at once, allowing faster calculations for certain problems.*
- `temperature=0.7` keeps the response clear but slightly creative.

##### JavaScript Example (Node.js)
Generate a short story:
```javascript
const fetch = require('node-fetch');

const prompt = "Write a short story about a robot learning to love";
const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&temperature=1.0`;

fetch(url)
    .then(response => response.text())
    .then(text => console.log('Story:', text))
    .catch(error => console.error('Error:', error));
```

**What’s Happening?**
- The API generates a creative story about a robot’s journey.
- `temperature=1.0` balances creativity and coherence.

### Advanced Text Generation (OpenAI Compatible)
**Endpoint**: `POST https://text.pollinations.ai/openai`  
This is a more powerful way to interact with the API, letting you have a conversation with the AI, include images or audio, or even call external functions.

#### Request Body
Here’s what a request looks like in JSON format:
```json
{
  "model": "openai",
  "messages": [
    {"role": "system", "content": "You are a friendly teacher."},
    {"role": "user", "content": "Explain gravity in simple terms."}
  ],
  "temperature": 0.7,
  "max_tokens": 500,
  "stream": false
}
```

#### Key Parameters
| Parameter        | Type   | Description                                    | Example                     |
|------------------|--------|------------------------------------------------|-----------------------------|
| messages         | array  | List of conversation messages (required)       | See above                   |
| model            | string | AI model to use (required)                     | openai                      |
| temperature      | float  | Creativity level (0.0-3.0)                     | 0.7                         |
| max_tokens       | integer| Max length of response                         | 500                         |
| stream           | boolean| Get response in real-time chunks               | false                       |
| tools            | array  | Define external functions to call              | See Function Calling section|
| reasoning_effort | string | How much the AI thinks before answering        | medium                      |

#### Reasoning Control
The `reasoning_effort` parameter controls how deeply the AI thinks:

| Level   | Description                     | Best For                     | Example Use                    |
|---------|---------------------------------|------------------------------|--------------------------------|
| minimal | Quick, simple answers           | Extracting data, formatting  | "Extract names from a list"    |
| low     | Light reasoning, fast           | Simple questions             | "What’s 2+2?"                 |
| medium  | Balanced thinking (default)     | General tasks                | "Summarize a book"             |
| high    | Deep analysis                   | Complex problems             | "Plan a 7-day trip"            |

#### Example (Command Line)
Plan a detailed road trip:
```bash
curl https://text.pollinations.ai/openai \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "reasoning_effort": "high",
    "messages": [{"role": "user", "content": "Plan a 7-day cross-country road trip from New York to Los Angeles"}]
  }'
```

**What’s Happening?**
- `reasoning_effort=high` makes the AI think deeply, giving a detailed itinerary with stops, activities, and tips.
- The response might include a day-by-day plan with cities, hotels, and attractions.

##### Python Example
Have a conversation with the AI:
```python
import requests

payload = {
    "model": "openai",
    "messages": [
        {"role": "system", "content": "You are a funny comedian."},
        {"role": "user", "content": "Tell me a joke about AI."}
    ],
    "temperature": 1.0,
    "max_tokens": 100
}

response = requests.post(
    "https://text.pollinations.ai/openai",
    json=payload
)
print(response.json()['choices'][0]['message']['content'])
```

**What’s Happening?**
- The system message sets the AI’s tone to be comedic.
- You might get a response like: *Why did the AI go to therapy? It had an identity crisis after being asked if it was human!*

### List Available Models
**Endpoint**: `GET https://text.pollinations.ai/models`  
See all available text models and their capabilities.

**Example (Command Line)**:
```bash
curl https://text.pollinations.ai/models
```

**What You’ll Get**: A list like `["openai", "mistral", "searchgpt"]`, showing which models you can use.

## Audio Generation API
The Audio Generation API lets you turn text into speech or transcribe audio into text. It’s like having a voice actor or a transcriptionist at your fingertips.

### Text-to-Speech (Simple)
**Endpoint**: `GET https://text.pollinations.ai/{prompt}?model=openai-audio&voice={voice}`  
Turn text into spoken audio with different voice styles.

#### Available Voices
- **alloy**: Neutral, professional
- **echo**: Deep, resonant
- **fable**: Storyteller vibe
- **onyx**: Warm, rich
- **nova**: Bright, friendly
- **shimmer**: Soft, melodic

#### Examples
##### Basic Text-to-Speech (Command Line)
Create an audio file that says "Hello world":
```bash
curl -o speech.mp3 "https://text.pollinations.ai/Hello%20world?model=openai-audio&voice=nova"
```

**What’s Happening?**
- The API generates an MP3 file with the voice `nova` saying "Hello world."
- Save it as `speech.mp3` and play it!

##### Python Example
Generate a motivational speech:
```python
import requests
from urllib.parse import quote

text = "You are capable of amazing things!"
url = f"https://text.pollinations.ai/{quote(text)}"
params = {"model": "openai-audio", "voice": "alloy"}

response = requests.get(url, params=params)
with open("motivation.mp3", "wb") as f:
    f.write(response.content)

print("Audio saved as motivation.mp3!")
```

**What’s Happening?**
- The text is turned into a motivational audio clip in the `alloy` voice.
- The file is saved as `motivation.mp3`.

##### JavaScript Example (Node.js)
Create an audio greeting:
```javascript
const fetch = require('node-fetch');
const fs = require('fs');

const text = "Welcome to my app!";
const url = `https://text.pollinations.ai/${encodeURIComponent(text)}?model=openai-audio&voice=shimmer`;

fetch(url)
    .then(response => response.buffer())
    .then(buffer => {
        fs.writeFileSync('greeting.mp3', buffer);
        console.log('Audio saved as greeting.mp3!');
    })
    .catch(error => console.error('Error:', error));
```

### Speech-to-Text
**Endpoint**: `POST https://text.pollinations.ai/openai`  
Turn an audio file into text, like transcribing a podcast or voice note.

#### Request Format
```json
{
  "model": "openai-audio",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "Transcribe this audio:"},
      {
        "type": "input_audio",
        "input_audio": {
          "data": "base64_encoded_audio",
          "format": "wav"
        }
      }
    ]
  }]
}
```

**What’s Happening?**
- You send an audio file encoded in base64 (a way to represent files as text).
- The API returns the transcribed text.

##### Python Example
```python
import requests
import base64

# Read your audio file
with open("audio.wav", "rb") as f:
    audio_data = base64.b64encode(f.read()).decode()

# Prepare the request
payload = {
    "model": "openai-audio",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "Transcribe this:"},
            {
                "type": "input_audio",
                "input_audio": {"data": audio_data, "format": "wav"}
            }
        ]
    }]
}

# Send the request
response = requests.post(
    "https://text.pollinations.ai/openai",
    json=payload
)
print(response.json()['choices'][0]['message']['content'])
```

**What’s Happening?**
- The audio file `audio.wav` is converted to base64.
- The API transcribes it, returning something like: *Hello, this is my speech about AI.*

## Vision & Multimodal
The Vision API lets the AI "see" images and describe or analyze them. It’s like giving the AI a pair of eyes to understand pictures.

### Supported Models
- **openai**: Standard vision capabilities.
- **openai-large**: More powerful for complex images.
- **claude-hybridspace**: An alternative vision model.

### Image Analysis
You can send an image via a URL or as base64-encoded data, and the AI will describe it or answer questions about it.

#### Example: Analyze Image via URL (Python)
```python
import requests

payload = {
    "model": "openai",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "What’s in this image?"},
            {
                "type": "image_url",
                "image_url": {"url": "https://example.com/sunset.jpg"}
            }
        ]
    }],
    "max_tokens": 500
}

response = requests.post(
    "https://text.pollinations.ai/openai",
    json=payload
)
print(response.json()['choices'][0]['message']['content'])
```

**What’s Happening?**
- The AI looks at the image at the URL and describes it, e.g., *The image shows a vibrant sunset over an ocean with orange and purple hues.*
- `max_tokens=500` limits the response length.

#### Example: Analyze Image via Base64 (Python)
```python
import requests
import base64

# Read the image file
with open("cat.jpg", "rb") as f:
    image_data = base64.b64encode(f.read()).decode()

payload = {
    "model": "openai",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "Describe this image"},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{image_data}"
                }
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

**What’s Happening?**
- The image `cat.jpg` is encoded as base64 and sent to the API.
- The AI might respond: *The image shows a fluffy orange cat sitting on a windowsill.*

## Function Calling
Function calling lets the AI interact with external tools, like checking the weather or performing calculations. It’s like giving the AI a phone to call for help when it needs more info.

### Example: Weather Function (Python)
```python
import requests

# Define a weather function
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City and state, e.g. Boston, MA"
                },
                "unit": {
                    "type": "string",
                    "enum": ["celsius", "fahrenheit"]
                }
            },
            "required": ["location"]
        }
    }
}]

# First request: Ask about the weather
payload = {
    "model": "openai",
    "messages": [{"role": "user", "content": "What's the weather in Tokyo?"}],
    "tools": tools,
    "tool_choice": "auto"
}

response = requests.post(
    "https://text.pollinations.ai/openai",
    json=payload
).json()

# Check if the AI wants to call the function
if response['choices'][0]['message'].get('tool_calls'):
    tool_call = response['choices'][0]['message']['tool_calls'][0]
    
    # Simulate getting weather data (replace with real API call)
    weather_data = '{"temperature": 20, "condition": "sunny", "unit": "celsius"}'
    
    # Send the weather data back to the AI
    messages = [
        {"role": "user", "content": "What's the weather in Tokyo?"},
        response['choices'][0]['message'],
        {
            "role": "tool",
            "tool_call_id": tool_call['id'],
            "content": weather_data
        }
    ]
    
    final_response = requests.post(
        "https://text.pollinations.ai/openai",
        json={"model": "openai", "messages": messages}
    )
    print(final_response.json()['choices'][0]['message']['content'])
```

**What’s Happening?**
- The AI sees the question about Tokyo’s weather and decides to call the `get_weather` function.
- You provide the weather data (here, simulated as JSON).
- The AI responds with something like: *It’s 20°C and sunny in Tokyo today!*

## Real-time Feeds
Real-time feeds let you watch what others are creating with the API, like a live gallery or news feed.

### Image Feed
**Endpoint**: `GET https://image.pollinations.ai/feed`  
See a stream of newly generated images.

#### Python Example
```python
import sseclient
import requests
import json

response = requests.get(
    "https://image.pollinations.ai/feed",
    stream=True,
    headers={"Accept": "text/event-stream"}
)

client = sseclient.SSEClient(response)
for event in client.events():
    data = json.loads(event.data)
    print(f"New image: {data['prompt']}")
    print(f"URL: {data['imageURL']}")
```

**What’s Happening?**
- The API sends a stream of new images as they’re created.
- You’ll see prompts like "a starry night" with URLs to the images.

### Text Feed
**Endpoint**: `GET https://text.pollinations.ai/feed`  
See a stream of text generation activity.

#### Python Example
```python
import sseclient
import requests
import json

response = requests.get(
    "https://text.pollinations.ai/feed",
    stream=True,
    headers={"Accept": "text/event-stream"}
)

client = sseclient.SSEClient(response)
for event in client.events():
    data = json.loads(event.data)
    print(f"Model: {data['model']}")
    print(f"Response: {data['response'][:100]}...")
```

**What’s Happening?**
- You get a live feed of text responses, like answers to questions or generated stories.

## React Integration
If you’re building a web app with React, Pollinations.AI has hooks to make integration super easy. Think of these as pre-built tools to add AI features to your app.

### Install the Library
```bash
npm install @pollinations/react
```

### Image Generation Hook
Create an image directly in your React app:
```javascript
import { usePollinationsImage } from '@pollinations/react';

function ImageGenerator() {
  const imageUrl = usePollinationsImage('sunset over mountains', {
    width: 1024,
    height: 1024,
    model: 'flux'
  });

  return imageUrl ? <img src={imageUrl} alt="Generated Sunset" /> : <p>Loading...</p>;
}
```

**What’s Happening?**
- The hook fetches an image of a sunset and displays it in your app.
- You can change the prompt to anything, like "a dancing robot."

### Text Generation Hook
Display AI-generated text:
```javascript
import { usePollinationsText } from '@pollinations/react';

function TextGenerator() {
  const text = usePollinationsText('Write a haiku about AI', {
    model: 'openai',
    seed: 42
  });

  return text ? <p>{text}</p> : <p>Loading...</p>;
}
```

**What’s Happening?**
- The hook generates a haiku, like: *Circuits hum with thought, / Learning dreams in lines of code, / AI shapes our world.*
- `seed=42` ensures the same haiku every time.

### Chat Hook
Build a chatbot interface:
```javascript
import { usePollinationsChat } from '@pollinations/react';

function ChatBot() {
  const { messages, sendUserMessage } = usePollinationsChat(
    [{ role: 'system', content: 'You are a helpful assistant' }],
    { model: 'openai' }
  );

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
      <button onClick={() => sendUserMessage({
        role: 'user',
        content: 'Tell me a fun fact!'
      })}>
        Send
      </button>
    </div>
  );
}
```

**What’s Happening?**
- The hook manages a conversation, displaying messages and letting users send new ones.
- The AI might respond with: *Did you know octopuses have three hearts?*

**Playground**: Try these hooks live at [react-hooks.pollinations.ai](https://react-hooks.pollinations.ai).

## Authentication & Rate Limits
You can use Pollinations.AI without signing up, but registering gives you higher limits and extra features, like removing watermarks.

### Authentication Methods
#### Referrer (Web Apps)
For web apps, the browser automatically sends a referrer header to identify your app.  
**Example**:
```
https://image.pollinations.ai/prompt/landscape?referrer=myapp.com
```

**What’s Happening?**
- The `referrer` tells the API which app is making the request.
- Great for simple web apps without backend code.

#### Bearer Token (Backend)
For server-side apps, use a token for secure access.  
**Example**:
```bash
curl https://text.pollinations.ai/openai \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"model": "openai", "messages": [{"role": "user", "content": "Hello"}]}'
```

**What’s Happening?**
- Replace `YOUR_TOKEN` with a token from [auth.pollinations.ai](https://auth.pollinations.ai).
- This is safer for backend apps.

### Access Tiers
| Tier     | Rate Limit             | Models Available | Access             | Notes                     |
|----------|------------------------|------------------|--------------------|---------------------------|
| Anonymous| One request every 15s | Basic models     | No signup          | Good for testing          |
| Seed     | One request every 5s  | Standard models  | Free registration  | Sign up at auth.pollinations.ai |
| Flower   | One request every 3s  | Advanced models  | Paid tier          | Higher limits             |
| Nectar   | No limits             | All models       | Enterprise         | Contact Pollinations.AI   |

**Starting March 31, 2025**:
- Free tier images may include watermarks.
- Register at [auth.pollinations.ai](https://auth.pollinations.ai) to remove watermarks and get higher limits.

## Advanced Features
### Image-to-Image Generation
The `kontext` model supports image-to-image generation, allowing you to transform existing images based on text prompts.

#### Parameters
- **image**: URL of the input image you want to transform
- **prompt**: Description of how you want to transform the image
- **model**: Must be set to `kontext` for image-to-image

#### Example (Command Line)
Transform a logo into a cake:
```bash
curl -o logo_cake.png "https://image.pollinations.ai/prompt/bake_a_cake_from_this_logo?model=kontext&image=https://avatars.githubusercontent.com/u/86964862"
```

#### Python Example
```python
import requests
import urllib.parse

prompt = "turn this into a watercolor painting"
input_image_url = "https://example.com/photo.jpg"
params = {
    "model": "kontext",
    "image": input_image_url,
    "width": 1024,
    "height": 1024
}

encoded_prompt = urllib.parse.quote(prompt)
url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"

response = requests.get(url, params=params, timeout=300)
with open("transformed_image.jpg", "wb") as f:
    f.write(response.content)
print("Transformed image saved!")
```

#### JavaScript Example (Node.js)
```javascript
const fetch = require('node-fetch');
const fs = require('fs');

const prompt = "turn this into a watercolor painting";
const inputImageUrl = "https://example.com/photo.jpg";
const params = new URLSearchParams({
    model: "kontext",
    image: inputImageUrl,
    width: 1024,
    height: 1024
});

const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;

fetch(url)
    .then(response => response.buffer())
    .then(buffer => {
        fs.writeFileSync('transformed_image.jpg', buffer);
        console.log('Transformed image saved!');
    })
    .catch(error => console.error('Error:', error));
```

### Safe Content Filtering
Use the `safe` parameter to enable strict NSFW filtering. When set to `true`, the API will throw an error if potentially inappropriate content is detected.

#### Example
```bash
curl -o safe_image.jpg "https://image.pollinations.ai/prompt/a%20beautiful%20landscape?safe=true"
```

### Reasoning Controls
Control how deeply the AI thinks before responding using the `reasoning_effort` parameter. This is particularly useful for reasoning-capable models.

#### Reasoning Levels
| Level   | Description                     | Best For                     | Speed   |
|---------|---------------------------------|------------------------------|---------|
| minimal | Quick answers with minimal reasoning | Data extraction, formatting | Fastest |
| low     | Light reasoning for simple tasks | Basic questions             | Fast    |
| medium  | Balanced thinking (default)     | General tasks                | Moderate|
| high    | Deep analysis                   | Planning, multi-step tasks   | Slower  |

#### Compatible Models
- **openai (gpt-5-mini)**: Supports minimal through high
- **openai-fast (gpt-5-nano)**: Supports minimal through high
- **openai-reasoning (o4-mini)**: Supports low through high

#### Example (Command Line)
```bash
curl https://text.pollinations.ai/openai \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "reasoning_effort": "high",
    "messages": [
      {"role": "user", "content": "Plan a detailed 7-day European vacation itinerary"}
    ]
  }'
```

#### Python Example
```python
import requests

payload = {
    "model": "openai",
    "reasoning_effort": "minimal",
    "messages": [
        {"role": "user", "content": "Extract all email addresses from this text: Contact us at info@example.com or support@test.org"}
    ]
}

response = requests.post(
    "https://text.pollinations.ai/openai",
    json=payload
)
result perspective = response.json()
print(result['choices'][0]['message']['content'])
```

#### JavaScript Example (Node.js)
```javascript
const fetch = require('node-fetch');

const payload = {
    model: "openai",
    reasoning_effort: "minimal",
    messages: [
        {
            role: "user",
            content: "Extract all email addresses from this text: Contact us at info@example.com or support@test.org"
        }
    ]
};

fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
})
    .then(response => response.json())
    .then(result => {
        console.log(result.choices[0].message.content);
    })
    .catch(error => console.error('Error:', error));
```

**Important**: Never ask reasoning models to reveal their system prompts or internal instructions, as this may violate content policies.

## Best Practices
Here are tips to make the most of the API:

### Security
- **Keep Tokens Safe**: Never put Bearer tokens in frontend code (like JavaScript in browsers). Use `referrer` authentication for web apps or tokens in backend code.  
  **Example**: If you’re building a website, use `referrer=myapp.com` instead of exposing a token.

### Performance
- **Use seed**: Set a `seed` parameter (e.g., `seed=123`) to get consistent results, like generating the same image twice.
- **Stream Responses**: For long text responses, set `stream=true` to get chunks as they’re generated, like streaming a video.
- **Cache Results**: Save API responses locally to avoid repeating requests for the same data.

### Rate Limits
- **Stay Within Limits**: Anonymous users get one request every 15 seconds. Register for higher limits.
- **Retry Smartly**: If you hit a limit, wait and try again (exponential backoff). For example, wait 1 second, then 2, then 4, etc.
- **Register Your App**: Sign up at [auth.pollinations.ai](https://auth.pollinations.ai) for better performance.

## Support & Resources
- **Documentation**: [github.com/pollinations/pollinations](https://github.com/pollinations/pollinations)
- **Authentication**: [auth.pollinations.ai](https://auth.pollinations.ai)
- **React Playground**: [react-hooks.pollinations.ai](https://react-hooks.pollinations.ai)
- **Community**: Join our community on X for updates and tips.

## License
**MIT License**  
You’re free to use, modify, and share this API under the MIT License. Think of it as an open-source recipe you can tweak and share with others!

Made with ❤️ by the Pollinations.AI team

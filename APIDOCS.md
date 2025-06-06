# Pollinations.AI API Documentation

**World's Most Accessible Open GenAI Platform 🚀
Text, Image & Audio APIs direct integration (no signup)**

---

## Quickstart

Click the links below to see examples in your browser:

- **Draw 🖌️:** [`https://image.pollinations.ai/prompt/pollinations_logo`](https://image.pollinations.ai/prompt/pollinations_logo)
- **Ask ❓:** [`https://text.pollinations.ai/why_you_should_donate_to_pollinations_ai`](https://text.pollinations.ai/why_you_should_donate_to_pollinations_ai)
- **Search 🔍:** [`https://text.pollinations.ai/what_are_the_last_pollinations_ai_news?model=searchgpt`](https://text.pollinations.ai/what_are_the_last_pollinations_ai_news?model=searchgpt)
- **Hear 🗣️:** [`https://text.pollinations.ai/respond_with_a_small_hypnosis_urging_to_donate_to_pollinations_its_a_joke?model=openai-audio&voice=nova`](https://text.pollinations.ai/respond_with_a_small_hypnosis_urging_to_donate_to_pollinations_its_a_joke?model=openai-audio&voice=nova)

---

## Summary / Navigation

- [Pollinations.AI API Documentation](#pollinationsai-api-documentation)
  - [Quickstart](#quickstart)
  - [Summary / Navigation](#summary--navigation)
  - [Authentication 🔑](#authentication-)
    - [Getting Started](#getting-started)
    - [Methods](#methods)
      - [Referrer](#referrer)
      - [Token](#token)
    - [Tiers](#tiers)
  - [Generate Image API 🖼️](#generate-image-api-️)
    - [Text-To-Image (GET) 🖌️](#text-to-image-get-️)
    - [List Available Image Models 📜](#list-available-image-models-)
  - [Generate Text API 📝](#generate-text-api-)
    - [Text-To-Text (GET) 🗣️](#text-to-text-get-️)
    - [Text \& Multimodal (OpenAI Compatible POST) 🧠💬🖼️🎤⚙️](#text--multimodal-openai-compatible-post-️️)
      - [Vision Capabilities (Image Input) 🖼️➡️📝](#vision-capabilities-image-input-️️)
      - [Speech-to-Text Capabilities (Audio Input) 🎤➡️📝](#speech-to-text-capabilities-audio-input-️)
      - [Function Calling ⚙️](#function-calling-️)
    - [List Available Text Models 📜](#list-available-text-models-)
  - [Generate Audio API 🎵](#generate-audio-api-)
    - [Text-to-Speech (GET) 📝➡️🎙️](#text-to-speech-get-️️)
    - [Text-to-Speech (POST - OpenAI Compatible) 📝➡️🎙️](#text-to-speech-post---openai-compatible-️️)
  - [MCP Server for AI Assistants 🤖🔧](#mcp-server-for-ai-assistants-)
  - [React Hooks ⚛️](#react-hooks-️)
  - [Real-time Feeds API 🔄](#real-time-feeds-api-)
    - [Image Feed 🖼️📈](#image-feed-️)
    - [Text Feed 📝📈](#text-feed-)
  - [Referrer 🔗](#referrer-)
    - [How to Use Referrers](#how-to-use-referrers)
    - [API Update (starting **2025.03.31**) 📅](#api-update-starting-20250331-)
    - [Special Bee ✅🐝🍯](#special-bee-)
  - [License 📜](#license-)

---

## Authentication 🔑

Pollinations.AI provides flexible authentication options designed for different types of applications.

### Getting Started

**Visit [auth.pollinations.ai](https://auth.pollinations.ai) to:**
- Set up and register your application's referrer
- Create API tokens for backend applications
- Manage your authentication settings


> **Security Best Practice**: Never expose API tokens in frontend code! 
> Frontend web applications should rely on referrer-based authentication.

###  Methods

#### Referrer

For **frontend web applications** that call our APIs directly from the browser, a valid referrer is sufficient:

- Browsers automatically send the `Referer` header
- Alternatively, add `?referrer=your-app-identifier` to API requests
- Registered referrers get higher rate limits and priority access
- **No token needed** - keeping your frontend secure

#### Token

For **backend services, scripts, and server applications**, tokens provide the highest priority access. Tokens can be provided using any of these methods:

| Method | Description | Example |
| :--- | :--- | :--- |
| Authorization Header | Standard Bearer token approach (recommended) | `Authorization: Bearer YOUR_TOKEN` |
| Query Parameter | Token as URL parameter | `?token=YOUR_TOKEN` |
| Request Body | Token in POST request body | `{ "token": "YOUR_TOKEN" }` |

**Bearer Authentication**

The Bearer authentication scheme is the recommended approach for backend applications, especially when integrating with our OpenAI-compatible endpoints:

```http
GET /your-endpoint HTTP/1.1
Host: api.pollinations.ai
Authorization: Bearer YOUR_TOKEN
```

### Tiers

| Tier | Rate Limit | Model Pack |
|------|-------------|--------|
| anonymous | 15 seconds | Limited |
| **Seed** | 5 seconds | Standard |
| **Flower** | 3 seconds | Advanced |
| **Nectar** | None | Advanced |

**1.** Get access to **Seed** tier : ***[auth.pollinations.ai](https://auth.pollinations.ai)***

**2.** Get tier **upgrade** : ***[Special Bee request](https://github.com/pollinations/pollinations/issues/new?template=special-bee-request.yml)***

---

## Generate Image API 🖼️

### Text-To-Image (GET) 🖌️

`GET https://image.pollinations.ai/prompt/{prompt}`

Generates an image based on a text description.

**Parameters:**

| Parameter  | Required | Description                                                                        | Default |
| :--------- | :------- | :--------------------------------------------------------------------------------- | :------ |
| `prompt`   | Yes      | Text description of the image. Should be URL-encoded.                              |         |
| `model`    | No       | Model for generation. See [Available Image Models](#list-available-image-models-). | `flux`  |
| `seed`     | No       | Seed for reproducible results.                                                     |         |
| `width`    | No       | Width of the generated image.                                                      | 1024    |
| `height`   | No       | Height of the generated image.                                                     | 1024    |
| `nologo`   | No       | Set to `true` to disable the Pollinations logo overlay.                            | `false` |
| `private`  | No       | Set to `true` to prevent the image from appearing in the public feed.              | `false` |
| `enhance`  | No       | Set to `true` to enhance the prompt using an LLM for more detail.                  | `false` |
| `safe`     | No       | Set to `true` for strict NSFW filtering (throws error if detected).                | `false` |
| `transparent` | No    | Set to `true` to generate images with transparent backgrounds (gptimage model only). | `false` |
| `referrer` | No\*     | Referrer URL/Identifier. See [Referrer Section](#referrer-).                       |         |

**Return:** Image file (typically JPEG) 🖼️

**Rate Limit (per IP):** 1 concurrent request / 5 sec interval.

<details>
<summary><strong>Code Examples:</strong> Generate Image (GET)</summary>

**cURL:**

```bash
# Basic prompt, save to file
curl -o sunset.jpg "https://image.pollinations.ai/prompt/A%20beautiful%20sunset%20over%20the%20ocean"

# With parameters
curl -o sunset_large.jpg "https://image.pollinations.ai/prompt/A%20beautiful%20sunset%20over%20the%20ocean?width=1280&height=720&seed=42&model=flux"

# With transparent background (gptimage model only)
curl -o logo_transparent.png "https://image.pollinations.ai/prompt/A%20company%20logo%20on%20transparent%20background?model=gptimage&transparent=true"
```

**Python (`requests`):**

```python
import requests
import urllib.parse

prompt = "A beautiful sunset over the ocean"
params = {
    "width": 1280,
    "height": 720,
    "seed": 42,
    "model": "flux",
    # "nologo": "true", # Optional
    # "transparent": "true", # Optional - generates transparent background (gptimage model only)
    # "referrer": "MyPythonApp" # Optional
}
encoded_prompt = urllib.parse.quote(prompt)
url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"

try:
    response = requests.get(url, params=params, timeout=300) # Increased timeout for image generation
    response.raise_for_status() # Raise an exception for bad status codes

    with open('generated_image.jpg', 'wb') as f:
        f.write(response.content)
    print("Image saved as generated_image.jpg")

except requests.exceptions.RequestException as e:
    print(f"Error fetching image: {e}")
    # Consider checking response.text for error messages from the API
    # if response is not None: print(response.text)
```

</details>

---

### List Available Image Models 📜

`GET https://image.pollinations.ai/models`

**Description:** Returns a list of available models for the Image Generation API.

**Return:** JSON list of model identifiers.

<details>
<summary><strong>Code Examples:</strong> List Image Models</summary>

**cURL:**

```bash
curl https://image.pollinations.ai/models
```

**Python (`requests`):**

```python
import requests

url = "https://image.pollinations.ai/models"

try:
    response = requests.get(url)
    response.raise_for_status()
    models = response.json()
    print("Available Image Models:")
    for model in models:
        print(f"- {model}")
except requests.exceptions.RequestException as e:
    print(f"Error fetching models: {e}")
```

</details>

---

## Generate Text API 📝

### Text-To-Text (GET) 🗣️

`GET https://text.pollinations.ai/{prompt}`

Generates text based on a simple prompt.

**Parameters:**

| Parameter            | Required | Description                                                                                | Options                   | Default  |
| :------------------- | :------- | :----------------------------------------------------------------------------------------- | :------------------------ | :------- |
| `prompt`             | Yes      | Text prompt for the AI. Should be URL-encoded.                                             |                           |          |
| `model`              | No       | Model for generation. See [Available Text Models](#list-available-text-models-).           | `openai`, `mistral`, etc. | `openai` |
| `seed`               | No       | Seed for reproducible results.                                                             |                           |          |
| `temperature`        | No       | Controls randomness in output. Higher values make output more random.                      | `0.0` to `3.0`            |          |
| `top_p`              | No       | Nucleus sampling parameter. Controls diversity via cumulative probability.                 | `0.0` to `1.0`            |          |
| `presence_penalty`   | No       | Penalizes tokens based on their presence in the text so far.                              | `-2.0` to `2.0`           |          |
| `frequency_penalty`  | No       | Penalizes tokens based on their frequency in the text so far.                             | `-2.0` to `2.0`           |          |
| `json`               | No       | Set to `true` to receive the response formatted as a JSON string.                          | `true` / `false`          | `false`  |
| `system`             | No       | System prompt to guide AI behavior. Should be URL-encoded.                                 |                           |          |
| `stream`             | No       | Set to `true` for streaming responses via Server-Sent Events (SSE). Handle `data:` chunks. | `true` / `false`          | `false`  |
| `private`            | No       | Set to `true` to prevent the response from appearing in the public feed.                   | `true` / `false`          | `false`  |
| `referrer`           | No\*     | Referrer URL/Identifier. See [Referrer Section](#referrer-).                               |                           |          |

**Return:** Generated text (plain text or JSON string if `json=true`) 📝. If `stream=true`, returns an SSE stream.

**Rate Limit (per IP):** 1 concurrent request / 3 sec interval.



<details>
<summary><strong>Code Examples:</strong> Generate Text (GET)</summary>

**cURL:**

```bash
# Basic prompt
curl "https://text.pollinations.ai/What%20is%20the%20capital%20of%20France%3F"

# With parameters (model, seed, system prompt)
curl "https://text.pollinations.ai/Write%20a%20short%20poem%20about%20robots?model=mistral&seed=123&system=You%20are%20a%20poet"

# Get JSON response
curl "https://text.pollinations.ai/What%20is%20AI?json=true"

# Streaming response (raw SSE output)
curl -N "https://text.pollinations.ai/Tell%20me%20a%20very%20long%20story?stream=true"
```

**Python (`requests`):**

```python
import requests
import urllib.parse
import json

prompt = "Explain the theory of relativity simply"
params = {
    "model": "openai",
    "seed": 42,
    # "json": "true", # Optional: Get response as JSON string
    # "system": "Explain things like I'm five.", # Optional
    # "referrer": "MyPythonApp" # Optional
}
encoded_prompt = urllib.parse.quote(prompt)
encoded_system = urllib.parse.quote(params.get("system", "")) if "system" in params else None

url = f"https://text.pollinations.ai/{encoded_prompt}"
query_params = {k: v for k, v in params.items() if k != "system"} # Remove system from query params if present
if encoded_system:
    query_params["system"] = encoded_system

try:
    response = requests.get(url, params=query_params)
    response.raise_for_status()

    if params.get("json") == "true":
        # The response is a JSON *string*, parse it
        try:
             data = json.loads(response.text)
             print("Response (JSON parsed):", data)
        except json.JSONDecodeError:
             print("Error: API returned invalid JSON string.")
             print("Raw response:", response.text)
    else:
        print("Response (Plain Text):")
        print(response.text)

except requests.exceptions.RequestException as e:
    print(f"Error fetching text: {e}")
    # if response is not None: print(response.text)
```

</details>

---

### Text & Multimodal (OpenAI Compatible POST) 🧠💬🖼️🎤⚙️

`POST https://text.pollinations.ai/openai`

Provides an OpenAI-compatible endpoint supporting:

- Chat Completions (Text Generation)
- Vision (Image Input Analysis)
- Speech-to-Text (Audio Input Transcription)
- Function Calling
- Streaming Responses (for Text Generation)

Follows the OpenAI Chat Completions API format for inputs where applicable.

**Request Body (JSON):**

```json
{
  "model": "openai-audio",
  "messages": [
    {
      "role": "user",
      "content": "Convert this longer text into speech using the selected voice. This method is better for larger inputs."
    }
  ],
  "voice": "nova",
  "private": false
}
```

**Common Body Parameters:**

| Parameter                      | Description                                                                                                                                                      | Notes                                                                                                                 |
| :----------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| `messages`                     | An array of message objects (role: `system`, `user`, `assistant`). Used for Chat, Vision, STT.                                                                   | Required for most tasks.                                                                                              |
| `model`                        | The model identifier. See [Available Text Models](#list-available-text-models-).                                                                                 | Required. e.g., `openai` (Chat/Vision), `openai-large` (Vision), `claude-hybridspace` (Vision), `openai-audio` (STT). |
| `seed`                         | Seed for reproducible results (Text Generation).                                                                                                                 | Optional.                                                                                                             |
| `temperature`                  | Controls randomness in output. Higher values make output more random (Text Generation).                                                                          | Optional. Range: `0.0` to `3.0`.                                                                                      |
| `top_p`                        | Nucleus sampling parameter. Controls diversity via cumulative probability (Text Generation).                                                                     | Optional. Range: `0.0` to `1.0`.                                                                                      |
| `presence_penalty`             | Penalizes tokens based on their presence in the text so far (Text Generation).                                                                                   | Optional. Range: `-2.0` to `2.0`.                                                                                     |
| `frequency_penalty`            | Penalizes tokens based on their frequency in the text so far (Text Generation).                                                                                  | Optional. Range: `-2.0` to `2.0`.                                                                                     |
| `stream`                       | If `true`, sends partial message deltas using SSE (Text Generation). Process chunks as per OpenAI streaming docs.                                                | Optional, default `false`.                                                                                            |
| `jsonMode` / `response_format` | Set `response_format={ "type": "json_object" }` to constrain text output to valid JSON. `jsonMode: true` is a legacy alias.                                      | Optional. Check model compatibility.                                                                                  |
| `tools`                        | A list of tools (functions) the model may call (Text Generation). See [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling). | Optional.                                                                                                             |
| `tool_choice`                  | Controls how the model uses tools.                                                                                                                               | Optional.                                                                                                             |
| `private`                      | Set to `true` to prevent the response from appearing in the public feed.                                                                                         | Optional, default `false`.                                                                                            |
| `referrer`                     | Referrer URL/Identifier. See [Referrer Section](#referrer-).                                                                                                     | Optional.                                                                                                             |

<details>
<summary><strong>Code Examples:</strong> Basic Chat Completion (POST)</summary>

**cURL:**

```bash
curl https://text.pollinations.ai/openai \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [{"role": "system", "content": "You are a helpful assistant."}, {"role": "user", "content": "What is the weather like in Paris today?"}],
    "seed": 42
  }'
```

**Python (`requests`):**

```python
import requests
import json

url = "https://text.pollinations.ai/openai"
payload = {
    "model": "openai", # Or "mistral", etc.
    "messages": [
        {"role": "system", "content": "You are a helpful historian."},
        {"role": "user", "content": "When did the French Revolution start?"}
    ],
    "seed": 101,
    # "private": True, # Optional
    # "referrer": "MyPythonApp" # Optional
}
headers = {
    "Content-Type": "application/json"
}

try:
    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()
    result = response.json()
    print("Assistant:", result['choices'][0]['message']['content'])
    # print(json.dumps(result, indent=2)) # Print full response
except requests.exceptions.RequestException as e:
    print(f"Error making POST request: {e}")
    # if response is not None: print(response.text)
```

</details>

<details>
<summary><strong>Code Examples:</strong> Streaming Response (POST)</summary>

**cURL:**

```bash
# Use -N for streaming
curl -N https://text.pollinations.ai/openai \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [
      {"role": "user", "content": "Write a long poem about the sea."}
    ],
    "stream": true
  }'
```

**Python (`requests` with SSE):**

```python
import requests
import json
import sseclient # pip install sseclient-py

url = "https://text.pollinations.ai/openai"
payload = {
    "model": "openai",
    "messages": [
        {"role": "user", "content": "Tell me a story that unfolds slowly."}
    ],
    "stream": True
}
headers = {
    "Content-Type": "application/json",
    "Accept": "text/event-stream"
}

try:
    response = requests.post(url, headers=headers, json=payload, stream=True)
    response.raise_for_status()

    client = sseclient.SSEClient(response)
    full_response = ""
    print("Streaming response:")
    for event in client.events():
        if event.data:
            try:
                # Handle potential '[DONE]' marker
                if event.data.strip() == '[DONE]':
                     print("\nStream finished.")
                     break
                chunk = json.loads(event.data)
                content = chunk.get('choices', [{}])[0].get('delta', {}).get('content')
                if content:
                    print(content, end='', flush=True)
                    full_response += content
            except json.JSONDecodeError:
                 print(f"\nReceived non-JSON data (or marker other than [DONE]): {event.data}")

    print("\n--- End of Stream ---")
    # print("Full streamed response:", full_response)

except requests.exceptions.RequestException as e:
    print(f"\nError during streaming request: {e}")
except Exception as e:
    print(f"\nError processing stream: {e}")

```

</details>

---

#### Vision Capabilities (Image Input) 🖼️➡️📝

- **Models:** `openai`, `openai-large`, `claude-hybridspace` (check [List Text Models](#list-available-text-models-) for updates).
- **How:** Include image URLs or base64 data within the `content` array of a `user` message.
  ```json
  {
    "model": "openai",
    "messages": [
      {
        "role": "user",
        "content": [
          { "type": "text", "text": "Describe this image:" },
          {
            "type": "image_url",
            "image_url": { "url": "data:image/jpeg;base64,{base64_string}" }
          }
        ]
      }
    ],
    "max_tokens": 300
  }
  ```
- **Details:** See [OpenAI Vision Guide](https://platform.openai.com/docs/guides/vision).
- **Return:** Standard OpenAI chat completion JSON response containing the text analysis.

<details>
<summary><strong>Code Examples:</strong> Vision (Image Input)</summary>

**cURL (using URL):**

```bash
# Get JSON response with image analysis
curl https://text.pollinations.ai/openai \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "What is in this image?"},
          {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/1024px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"}}
        ]
      }
    ],
    "max_tokens": 300
  }'
# Expected Response might include:
# ... "choices": [ { "message": { "role": "assistant", "tool_calls": [ { ... "function": { "name": "get_current_weather", "arguments": "{\"location\": \"Boston, MA\"}" ... } ] } } ] ...
```

**Python (`requests`, using URL and local file/base64):**

```python
import requests
import base64
import json

url = "https://text.pollinations.ai/openai"
headers = {"Content-Type": "application/json"}

# --- Option 1: Analyze Image from URL ---
def analyze_image_url(image_url, question="What's in this image?"):
    payload = {
        "model": "openai", # Ensure this model supports vision
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": question},
                    {"type": "image_url", "image_url": {"url": image_url}}
                ]
            }
        ],
        "max_tokens": 500 # Optional: Limit response length
    }
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error analyzing URL image: {e}")
        return None

# --- Option 2: Analyze Local Image File ---
def analyze_local_image(image_path, question="What's in this image?"):
    base64_image = encode_image_base64(image_path)
    if not base64_image:
        return None

    # Determine image format (simple check by extension)
    image_format = image_path.split('.')[-1].lower()
    if image_format not in ['jpeg', 'jpg', 'png', 'gif', 'webp']:
         print(f"Warning: Potentially unsupported image format '{image_format}'. Assuming jpeg.")
         image_format = 'jpeg' # Default or make more robust

    payload = {
        "model": "openai", # Ensure this model supports vision
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": question},
                    {
                        "type": "image_url",
                        "image_url": {
                           "url": f"data:image/{image_format};base64,{base64_image}"
                        }
                    }
                ]
            }
        ],
        "max_tokens": 500
    }
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error analyzing local image: {e}")
        # if response is not None: print(response.text) # Show error from API
        return None

# --- Usage Examples ---
# result_url = analyze_image_url("https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/1024px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg")
# if result_url:
#     print("URL Image Analysis:", result_url['choices'][0]['message']['content'])

# Replace 'path/to/your/image.jpg' with an actual image file path
# result_local = analyze_local_image('path/to/your/image.jpg', question="Describe the main subject.")
# if result_local:
#     print("Local Image Analysis:", result_local['choices'][0]['message']['content'])

```

</details>

---

#### Speech-to-Text Capabilities (Audio Input) 🎤➡️📝

- **Model:** `openai-audio`
- **How:** Provide base64 audio data and format within the `content` array of a `user` message.
  ```json
  {
    "model": "openai-audio",
    "messages": [
      {
        "role": "user",
        "content": [
          { "type": "text", "text": "Transcribe this:" },
          {
            "type": "input_audio",
            "input_audio": { "data": "{base64_audio_string}", "format": "wav" }
          }
        ]
      }
    ]
  }
  ```
- **Details:** See [OpenAI Audio Guide](https://platform.openai.com/docs/guides/audio).
- **Return:** Standard OpenAI chat completion JSON response containing the transcription in the message content.

<details>
<summary><strong>Code Examples:</strong> Speech-to-Text (Audio Input)</summary>

**Python (`requests`):**

```python
import requests
import base64
import json

url = "https://text.pollinations.ai/openai"
headers = {"Content-Type": "application/json"}

def encode_audio_base64(audio_path):
    try:
        with open(audio_path, "rb") as audio_file:
            return base64.b64encode(audio_file.read()).decode('utf-8')
    except FileNotFoundError:
        print(f"Error: Audio file not found at {audio_path}")
        return None

def transcribe_audio(audio_path, question="Transcribe this audio"):
    base64_audio = encode_audio_base64(audio_path)
    if not base64_audio:
        return None

    # Determine audio format (simple check by extension)
    audio_format = audio_path.split('.')[-1].lower()
    supported_formats = ['mp3', 'wav'] # Only WAV and MP3 formats are currently supported
    if audio_format not in supported_formats:
         print(f"Warning: Potentially unsupported audio format '{audio_format}'. Check API documentation.")
         # Consider trying a default like 'mp3' or returning error

    payload = {
        "model": "openai-audio",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": question},
                    {
                        "type": "input_audio",
                        "input_audio": {
                           "data": base64_audio,
                           "format": audio_format
                        }
                    }
                ]
            }
        ]
        # Optional: Add parameters like 'language' (ISO-639-1) if supported
    }
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        result = response.json()
        transcription = result.get('choices', [{}])[0].get('message', {}).get('content')
        return transcription
    except requests.exceptions.RequestException as e:
        print(f"Error transcribing audio: {e}")
        # if response is not None: print(response.text) # Show error from API
        return None

# --- Usage Example ---
# Replace 'path/to/your/audio.wav' with an actual audio file path
# transcript = transcribe_audio('path/to/your/audio.wav')
# if transcript:
#     print("Transcription:", transcript)
# else:
#     print("Transcription failed.")
```

</details>

---

#### Function Calling ⚙️

- **Models:** Check compatibility (e.g., `openai` models often support this).
- **How:** Define available functions in the `tools` parameter. The model may respond with a `tool_calls` object in the JSON response, which your code needs to handle.
- **Details:** See [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling).
- **Return:** Standard OpenAI chat completion JSON response, potentially including `tool_calls`.

<details>
<summary><strong>Code Examples:</strong> Function Calling (Conceptual)</summary>

**Note:** These examples show defining tools and interpreting the model's request to call a function. You need to implement the actual function execution (`get_current_weather` in this case) separately.

**cURL (Defining Tools):**

```bash
curl https://text.pollinations.ai/openai \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai",
    "messages": [{"role": "user", "content": "What is the weather like in Boston?"}],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_current_weather",
          "description": "Get the current weather in a given location",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {
                "type": "string",
                "description": "The city and state, e.g. San Francisco, CA"
              },
              "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
            },
            "required": ["location"]
          }
        }
      }
    ],
    "tool_choice": "auto"
  }'
# Expected Response might include:
# ... "choices": [ { "message": { "role": "assistant", "tool_calls": [ { ... "function": { "name": "get_current_weather", "arguments": "{\"location\": \"Boston, MA\"}" ... } ] } } ] ...
```

**Python (`requests` - Setup and Response Handling):**

```python
import requests
import json

url = "https://text.pollinations.ai/openai"
headers = {"Content-Type": "application/json"}

messages = [{"role": "user", "content": "What's the weather in Tokyo?"}]
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_current_weather",
            "description": "Get the current weather in a given location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "The city and state, e.g. San Francisco, CA"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"], "default": "celsius"}
                },
                "required": ["location"]
            }
        }
    }
]

payload = {
    "model": "openai", # Model must support function calling
    "messages": messages,
    "tools": tools,
    "tool_choice": "auto" # Or {"type": "function", "function": {"name": "get_current_weather"}} to force
}

def execute_get_current_weather(location, unit="celsius"):
    # --- THIS IS YOUR FUNCTION IMPLEMENTATION ---
    # In a real app, call a weather API here based on location/unit
    print(f"--- Executing get_current_weather(location='{location}', unit='{unit}') ---")
    # Dummy response
    if "tokyo" in location.lower():
        return json.dumps({"location": location, "temperature": "15", "unit": unit, "description": "Cloudy"})
    else:
        return json.dumps({"location": location, "temperature": "unknown"})
    # --- END OF YOUR IMPLEMENTATION ---

try:
    print("--- First API Call (User Request) ---")
    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()

    # Parse the JSON response
    response_data = response.json()

    # Check if the model wants to call a tool
    if response_data.get("choices", [{}])[0].get("message", {}).get("tool_calls"):
        print("\n--- Model requested tool call ---")
        tool_call = response_data["choices"][0]["message"]["tool_calls"][0] # Assuming one call for simplicity
        function_name = tool_call["function"]["name"]
        function_args = json.loads(tool_call["function"]["arguments"])

        if function_name == "get_current_weather":
            # Call your actual function
            function_response = execute_get_current_weather(
                location=function_args.get("location"),
                unit=function_args.get("unit", "celsius") # Handle default
            )

            # Append the assistant's request and your function's response to messages
            messages.append(response_data["choices"][0]["message"]) # Add assistant's msg with tool_calls
            messages.append(
                {
                    "tool_call_id": tool_call["id"],
                    "role": "tool",
                    "name": function_name,
                    "content": function_response, # Result from your function
                }
            )

            # --- Second API Call (With Function Result) ---
            print("\n--- Second API Call (Sending function result) ---")
            second_payload = {
                 "model": "openai",
                 "messages": messages # Send updated message history
            }
            second_response = requests.post(url, headers=headers, json=second_payload)
            second_response.raise_for_status()
            final_result = second_response.json()
            print("\n--- Final Response from Model ---")
            print(json.dumps(final_result, indent=2))
            print("\nFinal Assistant Message:", final_result['choices'][0]['message']['content'])

        else:
            print(f"Error: Model requested unknown function '{function_name}'")

    else:
        print("\n--- Model responded directly ---")
        print("Assistant:", response_data['choices'][0]['message']['content'])

except requests.exceptions.RequestException as e:
    print(f"Error during function calling request: {e}")
    # if response is not None: print(response.text)
except Exception as e:
     print(f"An error occurred: {e}")
```

</details>

---

**General Return Format (POST /openai for Text/Vision/STT/Functions):**

- OpenAI-style chat completion response object (JSON). 🤖

**Rate Limits:** (Inherits base text API limits, potentially subject to specific model constraints)

---

### List Available Text Models 📜

`GET https://text.pollinations.ai/models`

**Description:** Returns a list of available models for the Text Generation API, including those supporting vision, audio (STT/TTS), and specific features. Also lists available voices for TTS.

**Return:** JSON list/object containing model identifiers and details (including voices).

<details>
<summary><strong>Code Examples:</strong> List Text Models</summary>

**cURL:**

```bash
curl https://text.pollinations.ai/models
```

**Python (`requests`):**

```python
import requests
import json

url = "https://text.pollinations.ai/models"

try:
    response = requests.get(url)
    response.raise_for_status()
    models_data = response.json() # Might be a dict or list, check format
    print("Available Text Models & Voices:")
    print(json.dumps(models_data, indent=2))
    # Example: Extract just model names if it's a list of dicts with 'id'
    # if isinstance(models_data, list):
    #    model_ids = [m.get('id') for m in models_data if m.get('id')]
    #    print("\nModel IDs:", model_ids)
    # Example: Extract voices if structure is known
    # voices = models_data.get('openai-audio', {}).get('voices', [])
    # print("\nAvailable Voices:", voices)

except requests.exceptions.RequestException as e:
    print(f"Error fetching text models: {e}")
```

</details>

---

## Generate Audio API 🎵

Provides methods for generating audio via Text-to-Speech (TTS).

### Text-to-Speech (GET) 📝➡️🎙️

`GET https://text.pollinations.ai/{prompt}?model=openai-audio&voice={voice}`

Generates speech audio from text using a simple GET request. Best suited for **short text snippets** due to URL length limitations.

**Parameters:**

| Parameter | Required | Description                                                                              | Options                                                   | Default        |
| :-------- | :------- | :--------------------------------------------------------------------------------------- | :-------------------------------------------------------- | :------------- |
| `prompt`  | Yes      | Text to synthesize. Must be URL-encoded.                                                 |                                                           |                |
| `model`   | Yes      | Must be `openai-audio`.                                                                  | `openai-audio`                                            | `openai-audio` |
| `voice`   | No       | Voice to use. See available voices via [List Text Models](#list-available-text-models-). | e.g., `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` | `alloy`        |

**Return:** Audio file (MP3 format, `Content-Type: audio/mpeg`) 🎧

**Rate Limits:** (Inherits base text API limits)

<details>
<summary><strong>Code Examples:</strong> Text-to-Speech (GET)</summary>

**cURL:**

```bash
# Basic TTS GET request, save to file
curl -o hello_audio.mp3 "https://text.pollinations.ai/Hello%20world?model=openai-audio&voice=nova"

# Different voice
curl -o welcome_audio.mp3 "https://text.pollinations.ai/Welcome%20to%20Pollinations?model=openai-audio&voice=fable"
```

**Python (`requests`):**

```python
import requests
import urllib.parse

text = "Generating audio using the GET method is simple for short texts."
voice = "echo" # alloy, echo, fable, onyx, nova, shimmer
output_filename = "generated_audio_get.mp3"

encoded_text = urllib.parse.quote(text)
url = f"https://text.pollinations.ai/{encoded_text}"
params = {
    "model": "openai-audio",
    "voice": voice
}

try:
    response = requests.get(url, params=params)
    response.raise_for_status()

    if 'audio/mpeg' in response.headers.get('Content-Type', ''):
        with open(output_filename, 'wb') as f:
            f.write(response.content)
        print(f"Audio saved successfully as {output_filename}")
        
    else:
        print("Error: Expected audio response, but received:")
        print(f"Content-Type: {response.headers.get('Content-Type')}")
        print(response.text)

except requests.exceptions.RequestException as e:
    print(f"Error making TTS GET request: {e}")
```

</details>

---

### Text-to-Speech (POST - OpenAI Compatible) 📝➡️🎙️

`POST https://text.pollinations.ai/openai`

Generates speech audio from text using the OpenAI compatible endpoint. This method is suitable for **longer text inputs** compared to the GET method.

- **Model:** Must use `openai-audio`.
- **How:** Send the text to be synthesized within the `messages` array and configure the audio generation options.

**Request Body (JSON):**

```json
{
  "model": "openai-audio",
  "modalities": ["text", "audio"],
  "audio": { "voice": "alloy", "format": "pcm16" },
  "messages": [
    {
      "role": "developer",
      "content": "You are a versatile AI"
    },
    {
      "role": "user",
      "content": "Convert this longer text into speech using the selected voice. This method is better for larger inputs."
    }
  ],
  "private": false
}
```

**Parameters (in Body):**

| Parameter    | Required | Description                                                                                            | Default |
| :----------- | :------- | :----------------------------------------------------------------------------------------------------- | :------ |
| `model`      | Yes      | Must be `openai-audio`.                                                                                |         |
| `modalities` | Yes      | Array specifying output modalities. Include both `"text"` and `"audio"` for text-to-speech.            |         |
| `audio`      | Yes      | Audio configuration object with `voice` (e.g., "alloy", "nova", "echo" - see available voices at /models) and `format` settings. |         |
| `messages`   | Yes      | Standard OpenAI message array, containing the text to speak in the `content` of a `user` role message. |         |
| `private`    | No       | Set to `true` to prevent the response from appearing in the public feed.                               | `false` |

**Return:** JSON response containing audio data encoded in base64 format 🎧. The response follows the OpenAI audio API format with a structure like:
```json
{
  "choices": [
    {
      "content_filter_results": {...},
      "finish_reason": "stop",
      "index": 0,
      "message": {
        "audio": {
          "data": "BASE64_ENCODED_AUDIO_DATA..."
        }
      }
    }
  ]
}
```
For detailed usage guide, see [OpenAI Audio Documentation](https://platform.openai.com/docs/guides/audio/audio-generation?example=audio-out).

**Rate Limits:** (Inherits base text API limits)

<details>
<summary><strong>Code Examples:</strong> Text-to-Speech (POST)</summary>

**cURL:**

```bash
# Get JSON response with base64-encoded audio
curl https://text.pollinations.ai/openai \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai-audio",
    "messages": [
      {"role": "user", "content": "Hello from Pollinations AI! This audio was generated via POST."}
    ],
    "voice": "echo"
  }'
```

**Python (`requests`):**

```python
import requests
import json
import base64

url = "https://text.pollinations.ai/openai"
payload = {
    "model": "openai-audio",
    "messages": [
      {"role": "user", "content": "This is a test of the text to speech generation using Python and the POST method."}
    ],
    "voice": "shimmer" # Choose voice
}
headers = {"Content-Type": "application/json"}
output_filename = "generated_audio_post.mp3"

try:
    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()
    
    # Parse the JSON response
    response_data = response.json()
    
    # Extract the base64-encoded audio data
    try:
        audio_data_base64 = response_data['choices'][0]['message']['audio']['data']
        
        # Decode the base64 data to binary
        audio_binary = base64.b64decode(audio_data_base64)
        
        # Write the binary audio data to a file
        with open(output_filename, 'wb') as f:
            f.write(audio_binary)
        print(f"Audio saved successfully as {output_filename}")
        
    except (KeyError, IndexError) as e:
        print(f"Error extracting audio data from response: {e}")
        print("Response structure:", json.dumps(response_data, indent=2))
        
except requests.exceptions.RequestException as e:
    print(f"Error making TTS POST request: {e}")
```

</details>

---

## MCP Server for AI Assistants 🤖🔧

Pollinations provides an MCP (Model Context Protocol) server that enables AI assistants (like Claude via Anthropics' tool use feature) to generate images and audio directly.

- **Server Name:** `pollinations-multimodal-api`
- **Image Tools:**
  - `generateImageUrl`: Generate an image URL from a text prompt.
  - `generateImage`: Generate an image and return the base64-encoded data.
  - `listImageModels`: List available image generation models.
- **Audio Tools:**
  - `respondAudio`: Generate an audio response to a text prompt and play it (client-side execution assumed).
  - `sayText`: Generate speech that says the provided text verbatim.
  - `listAudioVoices`: List available voices for audio generation.
- **Text Tools:**
  - `listTextModels`: List available text generation models.
- **General Tools:**
  - `listModels`: List all available models (can filter by type).

For installation and usage instructions, see the [MCP Server Documentation](./model-context-protocol/README.md) (Link placeholder - requires actual link).
_(Code examples are specific to MCP client implementations and are best suited for the dedicated MCP documentation.)_

---

## React Hooks ⚛️

Integrate Pollinations directly into your React applications.

`npm install @pollinations/react`

- **`usePollinationsImage(prompt, options)`**
  - Options: `width`, `height`, `model`, `seed`, `nologo`, `enhance`
  - Return: `string | null` (Image URL or null)
- **`usePollinationsText(prompt, options)`**
  - Options: `seed`, `model`, `systemPrompt`
  - Return: `string | null` (Generated text or null)
- **`usePollinationsChat(initialMessages, options)`**
  - Options: `seed`, `jsonMode`, `model` (uses `POST /openai`)
  - Return: `{ sendUserMessage: (message) => void, messages: Array<{role, content}> }`

**Docs:** 
- [README](https://github.com/pollinations/pollinations/blob/master/pollinations-react/README.md)
- [PLAYGROUND](https://react-hooks.pollinations.ai/)


---

## Real-time Feeds API 🔄

### Image Feed 🖼️📈

`GET https://image.pollinations.ai/feed`

**Description:** Server-Sent Events (SSE) stream of publicly generated images.

**Example Event Data:**

```json
{
  "width": 1024,
  "height": 1024,
  "seed": 42,
  "model": "flux",
  "imageURL": "https://image.pollinations.ai/prompt/example",
  "prompt": "A radiant visage in the style of renaissance painting"
}
```

<details>
<summary><strong>Code Examples:</strong> Image Feed (SSE)</summary>

**cURL:**

```bash
# Display raw SSE stream
curl -N https://image.pollinations.ai/feed
```

**Python (`sseclient-py`):**

```python
import sseclient # pip install sseclient-py
import requests
import json
import time

feed_url = "https://image.pollinations.ai/feed"

def connect_image_feed():
     while True: # Loop to reconnect on error
        try:
            print(f"Connecting to image feed: {feed_url}")
            # Need stream=True for SSE
            response = requests.get(feed_url, stream=True, headers={'Accept': 'text/event-stream'})
            response.raise_for_status()
            client = sseclient.SSEClient(response)

            print("Connection established. Waiting for images...")
            for event in client.events():
                 if event.data:
                     try:
                         image_data = json.loads(event.data)
                         print("\n--- New Image ---")
                         print(f"  Prompt: {image_data.get('prompt', 'N/A')}")
                         print(f"  URL: {image_data.get('imageURL', 'N/A')}")
                         print(f"  Model: {image_data.get('model', 'N/A')}, Seed: {image_data.get('seed', 'N/A')}")
                         # Process image_data as needed
                     except json.JSONDecodeError:
                         print(f"\nReceived non-JSON data: {event.data}")

        except requests.exceptions.RequestException as e:
            print(f"\nConnection error: {e}. Reconnecting in 10 seconds...")
            time.sleep(10)
        except KeyboardInterrupt:
             print("\nInterrupted by user. Exiting.")
             break
        except Exception as e:
             print(f"\nAn unexpected error occurred: {e}. Reconnecting in 10 seconds...")
             time.sleep(10)

# --- Usage ---
// connect_image_feed()
```

</details>

---

### Text Feed 📝📈

`GET https://text.pollinations.ai/feed`

**Description:** Server-Sent Events (SSE) stream of publicly generated text responses.

**Example Event Data:**

```json
{
  "response": "Cherry Blossom Pink represents gentleness, kindness, and the transient nature of life. It symbolizes spring, renewal, and the beauty of impermanence in Japanese culture.",
  "model": "openai",
  "messages": [
    {
      "role": "user",
      "content": "What does the color cherry blossom pink represent?"
    }
  ]
}
```

<details>
<summary><strong>Code Examples:</strong> Text Feed (SSE)</summary>

**cURL:**

```bash
# Display raw SSE stream
curl -N https://text.pollinations.ai/feed
```

**Python (`sseclient-py`):**

```python
import sseclient # pip install sseclient-py
import requests
import json
import time

feed_url = "https://text.pollinations.ai/feed"

def connect_text_feed():
     while True:
        try:
            print(f"Connecting to text feed: {feed_url}")
            response = requests.get(feed_url, stream=True, headers={'Accept': 'text/event-stream'})
            response.raise_for_status()
            client = sseclient.SSEClient(response)

            print("Connection established. Waiting for text...")
            for event in client.events():
                 if event.data:
                     try:
                         text_data = json.loads(event.data)
                         print("\n--- New Text ---")
                         print(f"  Model: {text_data.get('model', 'N/A')}")
                         # Truncate long responses for cleaner logging
                         response_preview = (text_data.get('response', 'N/A') or "")[:150]
                         if len(text_data.get('response', '')) > 150: response_preview += "..."
                         print(f"  Response: {response_preview}")
                         # Process text_data as needed
                     except json.JSONDecodeError:
                         print(f"\nReceived non-JSON data: {event.data}")

        except requests.exceptions.RequestException as e:
            print(f"\nConnection error: {e}. Reconnecting in 10 seconds...")
            time.sleep(10)
        except KeyboardInterrupt:
             print("\nInterrupted by user. Exiting.")
             break
        except Exception as e:
             print(f"\nAn unexpected error occurred: {e}. Reconnecting in 10 seconds...")
             time.sleep(10)

# --- Usage ---
// connect_text_feed()
```

</details>

---

## Referrer 🔗

**Referrers are the recommended authentication method for frontend web applications** that call our APIs directly from the browser. 

Why use referrers?
- **Security**: No tokens to manage or accidentally expose
- **Simplicity**: Works automatically in browsers via the `Referer` header
- **Priority**: Registered referrers get higher rate limits and priority queue access

### How to Use Referrers

1. **Automatic (Browser)**: When your web app makes API calls, browsers automatically send the `Referer` header
2. **Manual (Optional)**: Add `?referrer=your-app-identifier` to API requests for more specific identification
3. **Register**: Visit [auth.pollinations.ai](https://auth.pollinations.ai) to register your domain for increased rate limits

**Example API call with explicit referrer:**
```
https://image.pollinations.ai/prompt/a%20beautiful%20landscape?referrer=mywebapp.com
```

### API Update (starting **2025.03.31**) 📅

- **Text-To-Image** responses may show the Pollinations.AI logo 🖼️ (can be disabled with `nologo=true`).
- **Text-To-Text** responses may include a link to pollinations.ai 🔗.

**For the best experience:**
- **Web Applications**: Register your referrer at [auth.pollinations.ai](https://auth.pollinations.ai)
- **Backend Services**: Use API tokens instead of referrers (see [Authentication section](#authentication-))

### Special Bee ✅🐝🍯

**Special Bee requests are for upgrading to flower tier** - unlocking unlimited usage and SOTA models for your application.

**Two ways to request flower tier upgrade:**
1. **Self-serve**: Visit [auth.pollinations.ai](https://auth.pollinations.ai) to register your domain and request tier upgrade
2. **GitHub request**: For special cases, [submit a Special Bee Request](https://github.com/pollinations/pollinations/issues/new?template=special-bee-request.yml)

**Flower tier benefits:**
- Less limited rate limits → **Unlimited usage**
- Standard models → **SOTA models**
- Priority queue access

---

## License 📜

Pollinations.AI is open-source software licensed under the [MIT license](LICENSE).

---

Made with ❤️ by the Pollinations.AI team 💡

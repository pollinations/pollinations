# Pollinations.AI API Documentation

**World's Most Accessible Open GenAI Platform 🚀
Text, Image & Audio APIs direct integration (no signup)**

---

## Quickstart

Click the links below to see examples in your browser:

- **Generate Image 🖌️:** [`https://image.pollinations.ai/prompt/pollinations_logo`](https://image.pollinations.ai/prompt/pollinations_logo)
- **Generate Text ❓:** [`https://text.pollinations.ai/why_you_should_donate_to_pollinations_ai`](https://text.pollinations.ai/why_you_should_donate_to_pollinations_ai)
- **Search 🔍:** [`https://text.pollinations.ai/what_are_the_last_pollinations_ai_news?model=elixposearch`](https://text.pollinations.ai/what_are_the_last_pollinations_ai_news?model=searchgpt)
- **Generate Audio 🗣️:** [`https://text.pollinations.ai/respond_with_a_small_hypnosis_urging_to_donate_to_pollinations_its_a_joke?model=openai-audio&voice=nova`](https://text.pollinations.ai/respond_with_a_small_hypnosis_urging_to_donate_to_pollinations_its_a_joke?model=openai-audio&voice=nova)

---
## Summary / Navigation
- [Pollinations.AI API Documentation](#pollinationsai-api-documentation)
  - [Quickstart](#quickstart)
  - [Summary / Navigation](#summary--navigation)
  - [Generate Image API 🖼️](#generate-image-api-️)
    - [1. Text-To-Image (GET) 🖌️](#1-text-to-image-get-️)
    - [2. List Available Image Models 📜](#2-list-available-image-models-)
  - [Generate Text API 📝](#generate-text-api-)
    - [1. Text-To-Text (GET) 🗣️](#1-text-to-text-get-️)
    - [2. List Available Text Models 📜](#2-list-available-text-models-)
    - [3. Text & Multimodal (OpenAI Compatible POST) 🧠💬🖼️🎤⚙️](#3-text--multimodal-openai-compatible-post-️️)
    - [4. Text-to-Speech (GET) 📝➡️🎙️](#4-text-to-speech-get-️️)
    - [5. Speech-to-Text Capabilities (Audio Input) 🎤➡️📝](#5-speech-to-text-capabilities-audio-input-️)
  - [Vision Capabilities (Image Input) 🖼️➡️📝](#vision-capabilities-image-input-️️)
  - [Function Calling ⚙️](#function-calling-️)
  - [MCP Server for AI Assistants 🤖🔧](#mcp-server-for-ai-assistants-)
  - [React Hooks ⚛️](#react-hooks-️)
  - [Real-time Feeds API 🔄](#real-time-feeds-api-)
  - [Authentication & Tiers 🔑](#authentication--tiers-)
  - [License 📜](#license-)
---

# Generate Image API 🖼️

### 1. Text-To-Image (GET) 🖌️

`GET https://image.pollinations.ai/prompt/{prompt}`

Generates an image based on a text description.

**Parameters:**

| Parameter  | Required | Description                                                                        | Default |
| :--------- | :------- | :--------------------------------------------------------------------------------- | :------ |
| `prompt`   | Yes      | Text description of the image. Should be URL-encoded.                              |         |
| `model`    | No       | Model for generation. See [Available Image Models](#list-available-image-models-). | `flux`  |
| `seed`     | No       | Seed for reproducible results.                                                     |         |
| `width`    | No       | Width of the generated image in pixels.                                            | 1024    |
| `height`   | No       | Height of the generated image in pixels.                                           | 1024    |
| `image`    | No       | URL of input image for image-to-image generation/editing (kontext model).    |         |
| `nologo`   | No       | Set to `true` to disable the Pollinations logo overlay (for registered users).     | `false` |
| `private`  | No       | Set to `true` to prevent the image from appearing in the public feed.              | `false` |
| `enhance`  | No       | Set to `true` to enhance the prompt using an LLM for more detail.                  | `false` |
| `safe`     | No       | Set to `true` for strict NSFW filtering (throws error if detected).                | `false` |
| `referrer` | No\*     | Referrer URL/Identifier. See [Referrer Section](#referrer).                        |         |

**Return:** Image file (typically JPEG) 🖼️

**Rate Limit (per IP):** 1 concurrent request / 5 sec interval (anonymous tier). See [Tiers](#tiers--rate-limits) for higher limits.

<details>
<summary><strong>Code Examples:</strong> Generate Image (GET)</summary>

**cURL:**

```bash
# Basic prompt, save to file
curl -o sunset.jpg "https://image.pollinations.ai/prompt/A%20beautiful%20sunset%20over%20the%20ocean"

# With parameters
curl -o sunset_large.jpg "https://image.pollinations.ai/prompt/A%20beautiful%20sunset%20over%20the%20ocean?width=1280&height=720&seed=42&model=flux"


# Image-to-image generation with kontext model
curl -o logo_cake.png "https://image.pollinations.ai/prompt/bake_a_cake_from_this_logo?model=kontext&image=https://avatars.githubusercontent.com/u/86964862"
```

**Python (`requests`):**

```python^
import requests
import urllib.parse

prompt = "A beautiful sunset over the ocean"
params = {
    "width": 1280,
    "height": 720,
    "seed": 42,
    "model": "flux",
    # "nologo": "true", # Optional, set to "true" for registered referrers/tokens
    # "image": "https://example.com/input-image.jpg", # Optional - for image-to-image generation (kontext model)
    # "referrer": "MyPythonApp" # Optional for referrer-based authentication
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


### 2. List Available Image Models 📜

`GET https://image.pollinations.ai/models`

**Description:** Returns a list of available models that can be used with the Generate Image API.

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

# Generate Text API 📝

### 1. Text-To-Text (GET) 🗣️

`GET https://text.pollinations.ai/{prompt}`

Generates text based on a simple prompt. This endpoint is ideal for straightforward text generation tasks.

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
| `referrer`           | No\*     | Referrer URL/Identifier. See [Referrer Section](#referrer).                                |                           |          |

**Return:** Generated text (plain text or JSON string if `json=true`) 📝. If `stream=true`, returns an SSE stream.

**Rate Limit (per IP):** 1 concurrent request / 3 sec interval (anonymous tier). See [Tiers](#tiers--rate-limits) for higher limits.

<details>
<summary><strong>Code Examples:</strong> Generate Text (GET)</summary>

**CURL:**

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
    # "referrer": "MyPythonApp" # Optional for referrer-based authentication
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



### 2. List Available Text Models 📜

`GET https://text.pollinations.ai/models`

**Description:** Returns a comprehensive list of available models for the Text Generation API. This includes models supporting text, vision, audio (Speech-to-Text and Text-to-Speech), and various other features. It also lists available voices for Text-to-Speech models.

**Return:** JSON list/object containing model identifiers and detailed information (e.g., capabilities, associated voices). The exact structure may vary, so it's best to inspect the output.

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
    models_data = response.json() 
    print("Available Text Models & Voices:")
    print(json.dumps(models_data, indent=2))
    
    # Example of how you might parse specific parts based on the expected structure:
    # If `models_data` is a list of dictionaries, you can extract model IDs:
    # if isinstance(models_data, list):
    #    model_ids = [m.get('id') for m in models_data if m.get('id')]
    #    print("\nModel IDs:", model_ids)
    
    # If `models_data` is a dictionary where keys are model IDs, and values contain details:
    # if isinstance(models_data, dict):
    #     print("\nAvailable Voices (from openai-audio model details):")
    #     openai_audio_details = models_data.get('openai-audio', {})
    #     if 'voices' in openai_audio_details:
    #         print(openai_audio_details['voices'])
    #     else:
    #         print("No specific voices listed for openai-audio, or structure differs.")

except requests.exceptions.RequestException as e:
    print(f"Error fetching text models: {e}")
```

</details>

---


### 3. Text & Multimodal (OpenAI Compatible POST) 🧠💬🖼️🎤⚙️

`POST https://text.pollinations.ai/openai`

Provides an OpenAI-compatible endpoint supporting advanced features including:

- **Chat Completions**: Standard text generation with message history.
- **Vision**: Analysis of image inputs.
- **Speech-to-Text**: Transcription of audio inputs.
- **Function Calling**: Allowing the model to invoke external tools.
- **Streaming Responses**: Real-time partial message deltas.

This endpoint follows the OpenAI Chat Completions API format for inputs where applicable, offering greater flexibility and power than the GET endpoint.

**Request Body (JSON Example):**

```json
{
  "model": "openai",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "What is the capital of France?"
    }
  ],
  "temperature": 0.7,
  "stream": true,
  "private": false
}
```

**Common Body Parameters:**

| Parameter                      | Description                                                                                                                                                      | Notes                                                                                                                 |
| :----------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| `messages`                     | An array of message objects (`role`: `system`, `user`, `assistant`). Used for Chat, Vision, STT.                                                                   | Required for most tasks.                                                                                              |
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
| `referrer`                     | Referrer URL/Identifier. See [Referrer Section](#referrer).                                                                                                      | Optional.                                                                                                             |

<details>
<summary><strong>Code Examples:</strong> Basic Chat Completion (POST)</summary>

**CURL:**

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
    # "referrer": "MyPythonApp" # Optional for referrer-based authentication
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

**CURL:**

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



### 4. Text-to-Speech (GET) 📝➡️🎙️

`GET https://text.pollinations.ai/{prompt}?model=openai-audio&voice={voice}`

Generates speech audio from text using a simple GET request. This method is best suited for **short text snippets** due to URL length limitations and direct audio file return.

**Parameters:**

| Parameter | Required | Description                                                                              | Options                                                   | Default        |
| :-------- | :------- | :--------------------------------------------------------------------------------------- | :-------------------------------------------------------- | :------------- |
| `prompt`  | Yes      | Text to synthesize. Must be URL-encoded.                                                 |                                                           |                |
| `model`   | Yes      | Must be `openai-audio` for Text-to-Speech functionality.                                 | `openai-audio`                                            | `openai-audio` |
| `voice`   | No       | The voice to use for synthesis. See available voices via [List Text Models](#list-available-text-models-). | e.g., `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` | `alloy`        |

**Return:** Audio file (MP3 format, `Content-Type: audio/mpeg`) 🎧 directly as the response body.

**Rate Limits:** (Inherits base text API limits). See [Tiers](#tiers--rate-limits) for details.

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

    # Check if the response content type indicates an audio file
    if 'audio/mpeg' in response.headers.get('Content-Type', ''):
        with open(output_filename, 'wb') as f:
            f.write(response.content)
        print(f"Audio saved successfully as {output_filename}")
        
    else:
        print("Error: Expected audio response, but received unexpected content type or data.")
        print(f"Content-Type: {response.headers.get('Content-Type')}")
        print("Response body preview (first 200 chars):", response.text[:200])

except requests.exceptions.RequestException as e:
    print(f"Error making TTS GET request: {e}")
    # if response is not None: print(response.text) # Print API error for debugging
```

</details>

---

### 5. Speech-to-Text Capabilities (Audio Input) 🎤➡️📝

- **Model:** `openai-audio`
- **How:** Provide base64 audio data and its format within the `content` array of a `user` message.
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
- **Details:** This functionality closely aligns with the OpenAI Audio API for transcriptions. See [OpenAI Audio Guide](https://platform.openai.com/docs/guides/audio).
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

    # Determine audio format (simple check by extension). Only WAV and MP3 are currently supported.
    audio_format = audio_path.split('.')[-1].lower()
    supported_formats = ['mp3', 'wav'] 
    if audio_format not in supported_formats:
         print(f"Warning: Potentially unsupported audio format '{audio_format}'. Only {', '.join(supported_formats)} are officially supported.")
         return None # Or raise an error if strict

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
        # Optional: Add parameters like 'language' (ISO-639-1) if supported by the model
    }
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        result = response.json()
        transcription = result.get('choices', [{}])[0].get('message', {}).get('content')
        return transcription
    except requests.exceptions.RequestException as e:
        print(f"Error transcribing audio: {e}")
        # if response is not None: print(response.text) # Show error from API for debugging
        return None

# --- Usage Example (Uncomment to run) ---
# # Replace 'path/to/your/audio.wav' with an actual audio file path (e.g., 'sample.wav' or 'sample.mp3')
# transcript = transcribe_audio('path/to/your/audio.wav') 
# if transcript:
#     print("Transcription:", transcript)
# else:
#     print("Transcription failed.")
```

</details>
---

# Vision Capabilities (Image Input) 🖼️➡️📝

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
- **Details:** This functionality mirrors the OpenAI Vision API. See [OpenAI Vision Guide](https://platform.openai.com/docs/guides/vision) for full specifications.
- **Return:** Standard OpenAI chat completion JSON response containing the text analysis.

<details>
<summary><strong>Code Examples:</strong> Vision (Image Input)</summary>

**CURL (using URL):**

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
```

**Python (`requests`, using URL and local file/base64):**

```python
import requests
import base64
import json

url = "https://text.pollinations.ai/openai"
headers = {"Content-Type": "application/json"}

# Helper function to encode local image to base64
def encode_image_base64(image_path):
    try:
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    except FileNotFoundError:
        print(f"Error: Image file not found at {image_path}")
        return None

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
         image_format = 'jpeg' # Default or make more robust for unknown formats

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

# --- Usage Examples (Uncomment to run) ---
# result_url = analyze_image_url("https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/1024px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg")
# if result_url:
#     print("URL Image Analysis:", result_url['choices'][0]['message']['content'])

# # Replace 'path/to/your/image.jpg' with an actual image file path
# result_local = analyze_local_image('path/to/your/image.jpg', question="Describe the main subject.")
# if result_local:
#     print("Local Image Analysis:", result_local['choices'][0]['message']['content'])

```

</details>

---


# Function Calling ⚙️

- **Models:** Check compatibility using the [List Text Models](#list-available-text-models-) endpoint (e.g., `openai` models often support this).
- **How:** Define available functions in the `tools` parameter of your request. The model may then respond with a `tool_calls` object, indicating its desire to invoke one or more of your defined functions. Your application is responsible for executing these functions and sending their results back to the model in a subsequent API call.
- **Details:** This feature closely mirrors the OpenAI Function Calling API. Refer to the [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling) for detailed implementation patterns.
- **Return:** Standard OpenAI chat completion JSON response, potentially including `tool_calls` when the model decides to use a tool, or a regular text response if it doesn't.

<details>
<summary><strong>Code Examples:</strong> Function Calling (Conceptual)</summary>

**Note:** These examples demonstrate how to define tools and how to interpret the model's request to call a function. You will need to implement the actual function execution (e.g., `get_current_weather` in this example) within your own application logic.

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
# Expected Response (if model chooses to call the tool) might include:
# ... "choices": [ { "message": { "role": "assistant", "tool_calls": [ { "id": "call_abc123", "type": "function", "function": { "name": "get_current_weather", "arguments": "{\"location\": \"Boston, MA\"}" } } ] } } ] ...
```

**Python (`requests` - Setup and Response Handling):**

```python
import requests
import json

url = "https://text.pollinations.ai/openai"
headers = {"Content-Type": "application/json"}

# Initial messages from the conversation
messages = [{"role": "user", "content": "What's the weather in Tokyo?"}]

# Definition of the tool(s) your application exposes to the AI model
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

# Payload for the initial API call
payload = {
    "model": "openai", # The model must support function calling
    "messages": messages,
    "tools": tools,
    "tool_choice": "auto" # Allows the model to decide whether to call a tool or respond directly
                         # Can also be set to force a specific tool: {"type": "function", "function": {"name": "get_current_weather"}}
}

# --- YOUR FUNCTION IMPLEMENTATION ---
# This function simulates fetching weather data. In a real application,
# it would make an actual API call to a weather service.
def execute_get_current_weather(location, unit="celsius"):
    print(f"\n--- Executing get_current_weather(location='{location}', unit='{unit}') ---")
    # Dummy response based on location
    if "tokyo" in location.lower():
        return json.dumps({"location": location, "temperature": "15", "unit": unit, "description": "Cloudy"})
    else:
        return json.dumps({"location": location, "temperature": "unknown"})
# --- END OF YOUR FUNCTION IMPLEMENTATION ---

try:
    print("--- First API Call (User Request) ---")
    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()

    # Parse the JSON response from the first API call
    response_data = response.json()

    # Check if the model decided to call a tool
    if response_data.get("choices", [{}])[0].get("message", {}).get("tool_calls"):
        print("\n--- Model requested tool call ---")
        # Assuming only one tool call for simplicity; iterate tool_calls for multiple
        tool_call = response_data["choices"][0]["message"]["tool_calls"][0] 
        function_name = tool_call["function"]["name"]
        function_args = json.loads(tool_call["function"]["arguments"])

        if function_name == "get_current_weather":
            # Call your actual backend function with arguments provided by the model
            function_response_content = execute_get_current_weather(
                location=function_args.get("location"),
                unit=function_args.get("unit", "celsius") # Handle default value
            )

            # Append the assistant's request (with tool_calls) to the message history
            messages.append(response_data["choices"][0]["message"]) 
            # Append the tool's response to the message history
            messages.append(
                {
                    "tool_call_id": tool_call["id"], # Crucial for linking tool call to its result
                    "role": "tool",
                    "name": function_name,
                    "content": function_response_content, # The actual result from your executed function
                }
            )

            # --- Second API Call (With Function Result) ---
            print("\n--- Second API Call (Sending function result back to model) ---")
            second_payload = {
                 "model": "openai",
                 "messages": messages # Send the updated message history including the tool's output
            }
            second_response = requests.post(url, headers=headers, json=second_payload)
            second_response.raise_for_status()
            final_result = second_response.json()
            print("\n--- Final Response from Model ---")
            print(json.dumps(final_result, indent=2))
            print("\nFinal Assistant Message:", final_result['choices'][0]['message']['content'])

        else:
            print(f"Error: Model requested an unknown function '{function_name}'")

    else:
        print("\n--- Model responded directly (no tool call) ---")
        print("Assistant:", response_data['choices'][0]['message']['content'])

except requests.exceptions.RequestException as e:
    print(f"Error during function calling request: {e}")
    # if response is not None: print(response.text) # Print API error for debugging
except Exception as e:
     print(f"An unexpected error occurred during processing: {e}")
```

</details>

---

**General Return Format (POST /openai for Text/Vision/STT/Functions):**

- OpenAI-style chat completion response object (JSON). 🤖 This format ensures compatibility and ease of integration with existing OpenAI API clients.

**Rate Limits:** (Inherits base text API limits, potentially subject to specific model constraints). See [Tiers](#tiers--rate-limits) for details.

---


# MCP Server for AI Assistants 🤖🔧

Pollinations provides an MCP (Model Context Protocol) server that enables AI assistants (like Claude via Anthropics' tool use feature) to generate images and audio directly through structured tool calls. This allows for complex workflows where the AI can autonomously decide to use creative or generative capabilities.

- **Server Name:** `pollinations-multimodal-api` (This name is typically used in the tool definition within the AI assistant's configuration).
- **Available Tools:**
  - **Image Tools:**
    - `generateImageUrl`: Generates an image and returns its publicly accessible URL.
    - `generateImage`: Generates an image and returns the base64-encoded image data directly in the response.
    - `listImageModels`: Lists all currently available image generation models.
  - **Audio Tools:**
    - `respondAudio`: Generates an audio response from a text prompt (intended for client-side playback).
    - `sayText`: Generates speech that verbatim pronounces the provided text.
    - `listAudioVoices`: Lists all available voices for audio generation.
  - **Text Tools:**
    - `listTextModels`: Lists all currently available text generation models.
  - **General Tools:**
    - `listModels`: A versatile tool to list all available models, with optional filtering by type (e.g., "image", "text", "audio").

For comprehensive installation and usage instructions, including how to integrate these tools into various AI assistant platforms, please refer to the dedicated **[MCP Server Documentation](./model-context-protocol/README.md)** (Note: This is a placeholder link and assumes a `README.md` exists at that path in the repository).

_(Code examples for MCP integrations are highly specific to the client-side implementation (e.g., how Claude's tool use works) and are best detailed in the dedicated MCP documentation.)_

---

# React Hooks ⚛️

The `@pollinations/react` library provides convenient React hooks to easily integrate Pollinations.AI APIs into your React applications, simplifying state management and API calls.

To install:
`npm install @pollinations/react`

**Available Hooks:**

- **`usePollinationsImage(prompt, options)`**
  - **Purpose:** Generates an image from a text prompt.
  - **Options:** `width`, `height`, `model`, `seed`, `nologo`, `enhance`. These mirror the parameters of the [Text-To-Image GET endpoint](#text-to-image-get-️).
  - **Return:** `string | null` (The URL of the generated image, or `null` if not yet generated or an error occurred).

- **`usePollinationsText(prompt, options)`**
  - **Purpose:** Generates text from a prompt.
  - **Options:** `seed`, `model`, `systemPrompt`. These align with the parameters of the [Text-To-Text GET endpoint](#text-to-text-get-️).
  - **Return:** `string | null` (The generated text, or `null` while loading or on error).

- **`usePollinationsChat(initialMessages, options)`**
  - **Purpose:** Manages a conversational chat flow using the OpenAI-compatible POST endpoint.
  - **Options:** `seed`, `jsonMode`, `model`. These map to parameters of the [Text & Multimodal POST endpoint](#text--multimodal-openai-compatible-post-️️).
  - **Return:** An object containing:
    - `sendUserMessage: (message: { role: 'user', content: string | Array<any> }) => void`: A function to send a new user message to the chat.
    - `messages: Array<{role: string, content: string}>`: The current array of messages in the conversation (including user and assistant messages).

**Documentation & Playground:** 
- **README:** [https://github.com/pollinations/pollinations/blob/master/pollinations-react/README.md](https://github.com/pollinations/pollinations/blob/master/pollinations-react/README.md)
- **PLAYGROUND:** Experiment with the hooks live at [https://react-hooks.pollinations.ai/](https://react-hooks.pollinations.ai/)

---

# Real-time Feeds API 🔄

The Real-time Feeds API provides Server-Sent Events (SSE) streams of publicly generated content, allowing you to observe creations happening on the Pollinations.AI platform as they occur. These feeds are read-only and provide a dynamic view into the platform's activity.

## 1. Image Feed 🖼️📈

`GET https://image.pollinations.ai/feed`

**Description:** An SSE stream that sends updates whenever a new public image is generated via the Pollinations.AI Image API. Each event contains metadata and the URL of the newly created image.

**Example Event Data (JSON per `data:` line):**

```json
{
  "width": 1024,
  "height": 1024,
  "seed": 42,
  "model": "flux",
  "imageURL": "https://image.pollinations.ai/prompt/a_radiant_visage_in_the_style_of_renaissance_painting",
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
            # Use stream=True for requests to handle SSE
            response = requests.get(feed_url, stream=True, headers={'Accept': 'text/event-stream'})
            response.raise_for_status() # Raise an exception for HTTP errors
            client = sseclient.SSEClient(response)

            print("Connection established. Waiting for new images...")
            for event in client.events():
                 if event.data:
                     try:
                         image_data = json.loads(event.data)
                         print("\n--- New Image ---")
                         print(f"  Prompt: {image_data.get('prompt', 'N/A')}")
                         print(f"  URL: {image_data.get('imageURL', 'N/A')}")
                         print(f"  Model: {image_data.get('model', 'N/A')}, Seed: {image_data.get('seed', 'N/A')}")
                         # You can further process image_data here, e.g., display in a UI, log to a database, etc.
                     except json.JSONDecodeError:
                         print(f"\nReceived non-JSON data from image feed: {event.data}")
                         
        except requests.exceptions.RequestException as e:
            print(f"\nConnection error to image feed: {e}. Reconnecting in 10 seconds...")
            time.sleep(10) # Wait before attempting to reconnect
        except KeyboardInterrupt:
             print("\nImage feed interrupted by user. Exiting.")
             break # Exit loop on manual interruption
        except Exception as e:
             print(f"\nAn unexpected error occurred in image feed: {e}. Reconnecting in 10 seconds...")
             time.sleep(10)

# --- Usage (Uncomment to run) ---
# connect_image_feed()
```

</details>

---

## 2. Text Feed 📝📈

`GET https://text.pollinations.ai/feed`

**Description:** An SSE stream that sends updates whenever a new public text response is generated via the Pollinations.AI Text API. Each event contains the generated response, the input messages, and the model used.

**Example Event Data (JSON per `data:` line):**

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
     while True: # Loop to reconnect on error
        try:
            print(f"Connecting to text feed: {feed_url}")
            response = requests.get(feed_url, stream=True, headers={'Accept': 'text/event-stream'})
            response.raise_for_status() # Raise an exception for HTTP errors
            client = sseclient.SSEClient(response)

            print("Connection established. Waiting for new text responses...")
            for event in client.events():
                 if event.data:
                     try:
                         text_data = json.loads(event.data)
                         print("\n--- New Text Response ---")
                         print(f"  Model: {text_data.get('model', 'N/A')}")
                         # Get the user prompt, if available in messages
                         user_prompt = "N/A"
                         if text_data.get('messages') and isinstance(text_data['messages'], list):
                             for msg in text_data['messages']:
                                 if msg.get('role') == 'user' and msg.get('content'):
                                     user_prompt = (msg['content'] or "")[:100] + ("..." if len(msg['content']) > 100 else "")
                                     break
                         print(f"  User Prompt: {user_prompt}")

                         # Truncate long responses for cleaner logging
                         response_preview = (text_data.get('response', 'N/A') or "")[:200]
                         if len(text_data.get('response', '')) > 200: response_preview += "..."
                         print(f"  Response: {response_preview}")
                         # You can further process text_data here, e.g., analyze content, display, etc.
                     except json.JSONDecodeError:
                         print(f"\nReceived non-JSON data from text feed: {event.data}")

        except requests.exceptions.RequestException as e:
            print(f"\nConnection error to text feed: {e}. Reconnecting in 10 seconds...")
            time.sleep(10) # Wait before attempting to reconnect
        except KeyboardInterrupt:
             print("\nText feed interrupted by user. Exiting.")
             break # Exit loop on manual interruption
        except Exception as e:
             print(f"\nAn unexpected error occurred in text feed: {e}. Reconnecting in 10 seconds...")
             time.sleep(10)

# --- Usage (Uncomment to run) ---
# connect_text_feed()
```

</details>


---

# Authentication & Tiers 🔑

**Pollinations.AI offers flexible authentication methods tailored to your application's needs.**

> **Note:** Authentication is **optional** for most use cases. However, registering your application unlocks faster response times, higher rate limits, and access to advanced features.

Choose the authentication approach that best fits your workflow—whether you're building a public web app, a backend service, or a high-volume integration.

### Getting Started

**Visit [auth.pollinations.ai](https://auth.pollinations.ai) to:**
- Set up and register your application's referrer
- Create API tokens for backend applications
- Manage your authentication settings

> **Security Best Practice**: Never expose API tokens in frontend code! 
> Frontend web applications should rely on referrer-based authentication.

### Authentication Methods

#### Referrer

For **frontend web applications** that call our APIs directly from the browser, a valid referrer is sufficient. This is the **recommended authentication method for web applications** due to its simplicity and security benefits.

- Browsers automatically send the `Referer` header.
- Alternatively, you can explicitly add `?referrer=your-app-identifier` to your API requests for more specific identification.
- Registered referrers get higher rate limits and priority access.
- **No token needed** - keeping your frontend secure by avoiding exposure of sensitive credentials.

**How to Use Referrers:**
1. **Automatic (Browser)**: When your web app makes API calls, browsers automatically send the `Referer` header.
2. **Manual (Optional)**: Add `?referrer=your-app-identifier` to API requests for more specific identification.
3. **Register**: Visit [auth.pollinations.ai](https://auth.pollinations.ai) to register your domain for increased rate limits and benefits.

**Example API call with explicit referrer:**
```
https://image.pollinations.ai/prompt/a%20beautiful%20landscape?referrer=mywebapp.com
```

#### Token

For **backend services, scripts, and server applications**, tokens provide the highest priority access and are the **recommended method for non-browser environments**. Tokens can be provided using any of these methods:

| Method | Description | Example |
| :--- | :--- | :--- |
| Authorization Header | Standard Bearer token approach (recommended) | `Authorization: Bearer YOUR_TOKEN` |
| Query Parameter | Token as URL parameter | `?token=YOUR_TOKEN` |
| Request Body | Token in POST request body | `{ "token": "YOUR_TOKEN" }` |

**Bearer Authentication (Recommended for Backend)**

The Bearer authentication scheme is the recommended approach for backend applications, especially when integrating with our OpenAI-compatible endpoints:

```sh
curl https://text.pollinations.ai/openai \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "model": "openai",
    "messages": [
      {"role": "user", "content": "Tell me about yourself."}
    ]
  }'  
```

### Tiers & Rate Limits

Pollinations.AI offers different access tiers, each with varying rate limits and model availability.

| Tier | Rate Limit | Model Pack | Description |
|------|-------------|--------|-------------|
| anonymous | 15 seconds | Limited | Default tier for unauthenticated requests. |
| **Seed** | 5 seconds | Standard | Access for registered applications via [auth.pollinations.ai](https://auth.pollinations.ai). |
| **Flower** | 3 seconds | Advanced | Enhanced access with faster rate limits and a wider range of models. |
| **Nectar** | None | Advanced | Unlimited usage, typically for enterprise or high-volume partners. |

**How to Access Tiers:**
1. Get access to **Seed** tier: Visit ***[auth.pollinations.ai](https://auth.pollinations.ai)*** to register your application's referrer or create a token.
2. Higher tiers (Flower and Nectar) are available through [auth.pollinations.ai](https://auth.pollinations.ai).

### API Update (starting **2025.03.31**) 📅

To ensure sustainability and provide a clear distinction between free and supported usage:
- **Generate Image** responses may show the Pollinations.AI logo 🖼️. This can be disabled for registered users by setting `nologo=true` in the request parameters.
- **Generate Text** responses may include a link to pollinations.ai 🔗. This behavior might be adjusted or removed for higher tiers.

**For the best experience and to avoid these features:**
- **Web Applications**: Register your referrer at [auth.pollinations.ai](https://auth.pollinations.ai).
- **Backend Services**: Use API tokens instead of referrers (see [Authentication section](#authentication-)).


---

## License 📜

Pollinations.AI is open-source software licensed under the [MIT license](LICENSE). This means you are free to use, modify, and distribute the software, provided you include the original copyright and license notice.

---

Made with ❤️ by the Pollinations.AI team 💡

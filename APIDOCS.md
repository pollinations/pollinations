# Pollinations.AI API Documentation

---

## Basics

**World's Most Accessible Open GenAI Platform 🚀, integrate our text & image APIs (no signup).**

### Draw 🖌️

`https://image.pollinations.ai/prompt/pollinations_logo`

### Ask ❓

`https://text.pollinations.ai/why_you_should_donate_to_pollinations_ai`

### Search 🔍

`https://text.pollinations.ai/what_are_the_last_pollinations_ai_news?model=searchgpt`

### Hear 🗣️

`https://text.pollinations.ai/respond_with_a_small_hypnosis_urging_to_donate_to_pollinations_its_a_joke?model=openai-audio&voice=nova`

---

## Generate Image API

### Text-To-Image 🖼️

`GET https://image.pollinations.ai/prompt/{prompt}`

Generates an image based on a text description.

**Parameters:**

| Parameter  | Required | Description                                                                         | Default |
| :--------- | :------- | :---------------------------------------------------------------------------------- | :------ |
| `prompt`   | Yes      | Text description of the image. Should be URL-encoded.                               |         |
| `model`    | No       | Model for generation. See [Available Image Models](#list-available-image-models--). | `flux`  |
| `seed`     | No       | Seed for reproducible results.                                                      |         |
| `width`    | No       | Width of the generated image.                                                       | 1024    |
| `height`   | No       | Height of the generated image.                                                      | 1024    |
| `nologo`   | No       | Set to `true` to disable the Pollinations logo overlay.                             | `false` |
| `private`  | No       | Set to `true` to prevent the image from appearing in the public feed.               | `false` |
| `enhance`  | No       | Set to `true` to enhance the prompt using an LLM for more detail.                   | `false` |
| `safe`     | No       | Set to `true` for strict NSFW filtering (throws error if detected).                 | `false` |
| `referrer` | No\*     | Referrer URL/Identifier. See [Referrer Section](#referrer-).                        |         |

**Return:** Image file (typically JPEG) 🖼️

**Rate Limits:**

- **Per-IP Queue:**
  - Concurrency: 1 request at a time
  - Interval: 5000ms between requests

---

### List Available Image Models 📜

`GET https://image.pollinations.ai/models`

**Description:** Returns a list of available models for the Image Generation API.

**Return:** JSON list of model identifiers.

---

## Generate Text API

### Text-To-Text (GET) 📝

`GET https://text.pollinations.ai/{prompt}`

Generates text based on a simple prompt.

**Parameters:**

| Parameter  | Required | Description                                                                                | Options            | Default  |
| :--------- | :------- | :----------------------------------------------------------------------------------------- | :----------------- | :------- |
| `prompt`   | Yes      | Text prompt for the AI. Should be URL-encoded.                                             |                    |          |
| `model`    | No       | Model for generation. See [Available Text Models](#list-available-text-models--).          | [Available Models] | `openai` |
| `seed`     | No       | Seed for reproducible results.                                                             |                    |          |
| `json`     | No       | Set to `true` to receive the response formatted as a JSON string.                          |                    | `false`  |
| `system`   | No       | System prompt to guide AI behavior. Should be URL-encoded.                                 |                    |          |
| `stream`   | No       | Set to `true` for streaming responses via Server-Sent Events (SSE). Handle `data:` chunks. |                    | `false`  |
| `private`  | No       | Set to `true` to prevent the response from appearing in the public feed.                   |                    | `false`  |
| `referrer` | No\*     | Referrer URL/Identifier. See [Referrer Section](#referrer-).                               |                    |          |

**Return:** Generated text (plain text or JSON string if `json=true`) 📝

**Rate Limits:**

- **Per-IP Queue:**
  - Concurrency: 1 request at a time
  - Interval: 3000ms between requests

---

### Text & Multimodal (OpenAI Compatible POST) 🧠💬🖼️🎤📝➡️🎙️

`POST https://text.pollinations.ai/openai`

Provides an OpenAI-compatible endpoint supporting:

- Chat Completions (Text Generation)
- Vision (Image Input Analysis)
- Speech-to-Text (Audio Input Transcription)
- Text-to-Speech (Audio Output Generation)
- Function Calling
- Streaming Responses

Follows the OpenAI Chat Completions API format for inputs where applicable.

**Request Body (JSON):** Structure depends on the task, generally following [OpenAI API](https://platform.openai.com/docs/api-reference/) conventions.

**Common Body Parameters:**

| Parameter                      | Description                                                                                                                                                      | Notes                                                                                              |
| :----------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| `messages`                     | An array of message objects (role: `system`, `user`, `assistant`). Used for Chat, Vision, STT, TTS (input text).                                                 | Required for most tasks.                                                                           |
| `model`                        | The model identifier. See [Available Text Models](#list-available-text-models--).                                                                                | Required. e.g., `openai`, `openai-large`, `claude-hybridspace` (Vision), `openai-audio` (STT/TTS). |
| `seed`                         | Seed for reproducible results (Text Generation).                                                                                                                 | Optional.                                                                                          |
| `stream`                       | If `true`, sends partial message deltas using SSE (Text Generation). Process chunks as per OpenAI streaming docs.                                                | Optional, default `false`. Not applicable for direct audio output.                                 |
| `jsonMode` / `response_format` | Set `response_format={ "type": "json_object" }` to constrain text output to valid JSON. `jsonMode: true` is a legacy alias.                                      | Optional. Check model compatibility. Not applicable for audio output.                              |
| `tools`                        | A list of tools (functions) the model may call (Text Generation). See [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling). | Optional.                                                                                          |
| `tool_choice`                  | Controls how the model uses tools.                                                                                                                               | Optional.                                                                                          |
| `private`                      | Set to `true` to prevent the response from appearing in the public feed.                                                                                         | Optional, default `false`.                                                                         |
| `reasoning_effort`             | Sets reasoning effort for `o3-mini` model (Text Generation).                                                                                                     | Optional. Options: `low`, `medium`, `high`.                                                        |
| `voice`                        | Specifies the voice for Text-to-Speech.                                                                                                                          | Required for TTS. See [Available Text Models](#list-available-text-models--) for voice list.       |

---

#### **Vision Capabilities (Image Input)** 🖼️➡️📝

- **Models:** `openai`, `openai-large`, `claude-hybridspace` (check [List Text Models] for updates).
- **How:** Include image URLs or base64 data within the `content` array of a `user` message.
  ```json
  {
    // Request Body Snippet
    "model": "openai", // or other vision-capable model
    "messages": [
      {
        "role": "user",
        "content": [
          { "type": "text", "text": "Describe this image:" },
          {
            "type": "image_url",
            "image_url": { "url": "data:image/jpeg;base64,{base64_string}" }
          }
          // or { "url": "https://..." }
        ]
      }
    ]
  }
  ```
- **Details:** See [OpenAI Vision Guide](https://platform.openai.com/docs/guides/vision).
- **Return:** Standard OpenAI chat completion JSON response containing the text analysis.

---

#### **Speech-to-Text Capabilities (Audio Input)** 🎤➡️📝

- **Model:** `openai-audio`
- **How:** Provide base64 audio data and format within the `content` array of a `user` message.
  ```json
  {
    // Request Body Snippet
    "model": "openai-audio",
    "messages": [
      {
        "role": "user",
        "content": [
          { "type": "text", "text": "Transcribe this:" },
          {
            "type": "input_audio",
            "input_audio": { "data": "{base64_audio_string}", "format": "wav" }
          } // format can be wav, mp3, etc.
        ]
      }
    ]
  }
  ```
- **Details:** See [OpenAI Audio Guide](https://platform.openai.com/docs/guides/audio).
- **Return:** Standard OpenAI chat completion JSON response containing the transcription in the message content.

---

#### **Text-to-Speech Capabilities (Audio Output)** 📝➡️🎙️

- **Model:** `openai-audio`
- **How:** Send the text to be synthesized within the `messages` array and specify the desired `voice`.
  ```json
  {
    // Request Body
    "model": "openai-audio",
    "messages": [
      {
        "role": "user",
        "content": "Convert this text into speech using the selected voice."
      }
    ],
    "voice": "nova" // e.g., alloy, echo, fable, onyx, nova, shimmer
  }
  ```
- **Return:** Audio file (MP3 format, `Content-Type: audio/mpeg`) 🎧. The response body _is_ the audio data, not JSON.

---

#### **Function Calling** ⚙️

- **Models:** Check compatibility (e.g., `openai` models often support this).
- **How:** Define available functions in the `tools` parameter. The model may respond with a `tool_calls` object in the JSON response.
- **Details:** See [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling).
- **Return:** Standard OpenAI chat completion JSON response, potentially including `tool_calls`.

---

**General Return Format (POST /openai):**

- For Text Generation, Vision, STT, Function Calling: OpenAI-style chat completion response object (JSON). 🤖
- For Text-to-Speech: Raw audio file data (MP3). 🎧

**Rate Limits:** (Inherits base text API limits, potentially subject to specific model constraints)

---

### List Available Text Models 📜

`GET https://text.pollinations.ai/models`

**Description:** Returns a list of available models for the Text Generation API, including those supporting vision, audio (STT/TTS), and specific features. Also lists available voices for TTS.

**Return:** JSON list of model identifiers and details.

---

## Generate Audio API 🎵

Provides methods for generating audio, primarily focusing on Text-to-Speech.

_(Note: For generating audio via POST, suitable for longer text inputs, see the [Text-to-Speech Capabilities](#text-to-speech-capabilities-audio-output--) under the `POST /openai` endpoint.)_

### Text-to-Speech (GET) 📝➡️🎙️

`GET https://text.pollinations.ai/{prompt}?model=openai-audio&voice={voice}`

Generates speech audio from text using a simple GET request. Best suited for short text snippets due to URL length limitations.

**Parameters:**

| Parameter | Required | Description                                                | Options                                                   | Default        |
| :-------- | :------- | :--------------------------------------------------------- | :-------------------------------------------------------- | :------------- |
| `prompt`  | Yes      | Text to synthesize. Must be URL-encoded.                   |                                                           |                |
| `model`   | Yes      | Must be `openai-audio`.                                    | `openai-audio`                                            | `openai-audio` |
| `voice`   | No       | Voice to use. See available voices via [List Text Models]. | e.g., `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` | `alloy`        |

**Return:** Audio file (MP3 format, `Content-Type: audio/mpeg`) 🎧

**Rate Limits:** (Inherits base text API limits)

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

**Docs:** [https://pollinations.ai/react-hooks](https://pollinations.ai/react-hooks)

---

## Real-time Feeds API 🔄

### Image Feed 🖼️📈

`GET https://image.pollinations.ai/feed`

**Description:** Server-Sent Events (SSE) stream of publicly generated images.

**Example Event Data:**

```json
data: {
  "width": 1024,
  "height": 1024,
  "seed": 42,
  "model": "flux",
  "imageURL": "https://image.pollinations.ai/prompt/...",
  "prompt": "A radiant visage...",
  ...
}
```

---

### Text Feed 📝📈

`GET https://text.pollinations.ai/feed`

**Description:** Server-Sent Events (SSE) stream of publicly generated text responses.

**Example Event Data:**

```json
data: {
  "response": "Cherry Blossom Pink represents...",
  "model": "openai",
  "messages": [ ...openai messages array... ],
  ...
}
```

---

## Referrer 🔗

### API Update (starting **2025.03.12**) 📅

- **Text-To-Image** responses may show the Pollinations.AI logo 🖼️ (can be disabled with `nologo=true`).
- **Text-To-Text** responses may include a link to pollinations.ai 🔗.

**To potentially influence future default behavior or qualify for different rate limits:** Add a `referrer` parameter to your API requests.

- **Web Apps:** Browsers typically send this via the `Referer` HTTP header automatically. Explicitly setting the `referrer` parameter can provide more specific context.
- **Bots & Backend Apps:** Add the `referrer` parameter (e.g., `?referrer=MyCoolBot`) to identify your application.

### Whitelisting ✅

Projects can **request to have their referrer whitelisted** for potentially enhanced API access (e.g., priority queue, modified rate limits). This is evaluated on a case-by-case basis. [Submit a Domain Whitelisting Request](https://github.com/pollinations/pollinations/issues/new?template=project-submission.yml)

---

## License 📜

Pollinations.AI is open-source software licensed under the [MIT license](LICENSE).

---

Made with ❤️ by the Pollinations.AI team 💡

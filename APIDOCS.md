# Pollinations.AI API Documentation

---

## Generate Image API

### Text-To-Image

`GET https://image.pollinations.ai/prompt/{prompt}`

**Parameters:**

| Parameter   | Required | Description                                                                    | Default |
| :---------- | :------- | :----------------------------------------------------------------------------- | :------ |
| `prompt`    | Yes      | Text description of the image you want to generate. Should be URL-encoded.      |         |
| `model`     | No       | Model to use for generation. See [Available Models](https://image.pollinations.ai/models). |         |
| `seed`      | No       | Seed for reproducible results.                                                 |         |
| `width`     | No       | Width of the generated image.                                                  | 1024    |
| `height`    | No       | Height of the generated image.                                                 | 1024    |
| `nologo`    | No       | Set to `true` to turn off the rendering of the logo.                           | `false` |
| `private`   | No       | Set to `true` to prevent the image from appearing in the public feed.          | `false` |
| `enhance`   | No       | Set to `true` to turn on prompt enhancing.                                     | `false` |
| `safe`      | No       | Set to `true` to enable strict NSFW content filtering.                         | `false` |
| `referrer`  | No*       | Referrer URL indicating the origin of the request.        |         |

**Return:** Image file (JPEG)

**Rate Limits:** Per-IP Queue: 
  - Concurrency: 1 request at a time
  - Interval: 5000ms between requests

**Example:**

---

## Generate Text API

### Text-To-Text

`GET https://text.pollinations.ai/{prompt}`

**Parameters:**

| Parameter   | Required | Description                                                                                      | Options             | Default |
| :---------- | :------- | :----------------------------------------------------------------------------------------------- | :------------------ | :------ |
| `prompt`    | Yes      | Text prompt for the AI to respond to. Should be URL-encoded.                                    |                     |         |
| `model`     | No       | Model to use for text generation.                                                                | 'openai', 'mistral' |         |
| `seed`      | No       | Seed for reproducible results.                                                                   |                     |         |
| `json`      | No       | Set to `true` to receive response in JSON format.                                              |                     |         |
| `system`    | No       | System prompt to set the behavior of the AI. Should be URL-encoded.                              |                     |         |
| `stream`    | No       | Set to `true` to enable streaming responses via SSE. Process the stream as detailed in OpenAI’s streaming documentation. |                     | `false` |
| `private`   | No       | Set to `true` to prevent the response from appearing in the public feed.                         |                     | `false` |
| `referrer`  | No*       | Referrer URL indicating the origin of the request.       |         |

**Return:** Generated text

**Rate Limits:** Per-IP Queue: 
  - Concurrency: 1 request at a time
  - Interval: 3000ms between requests

**Example:**

### Text-To-Text (OpenAI Compatible)

`POST https://text.pollinations.ai/openai`

Function calling capabilities are now available for models that support this feature. 
Our implementation follows the OpenAI API specification for function calling. 
When using compatible models through our /openai endpoint, you can define tools and receive structured function calls from the model. 
For complete documentation on how to use this feature, please refer to the [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling).

**Return:** OpenAI-style response

**Rate Limits:** 

**Example:**

### Speech-To-Text (Understand Audio)

Speech-to-text capabilities are also available through the openai-audio model.

Note: Our audio features follow the OpenAI audio API specification. For more details and advanced usage, see the [OpenAI Audio Guide](https://platform.openai.com/docs/guides/audio).

**Return:** Text transcription of the audio file in MP3 format (Content-Type: audio/mpeg)

**Rate Limits:**

**Example:**

---

## Generate Audio API

### Text-to-Speech

Use the `openai-audio` model.

**GET:** `https://text.pollinations.ai/{prompt}?model=openai-audio&voice={voice}`

| Parameter   | Required | Description                                                            | Options | Default         |
|-------------|----------|------------------------------------------------------------------------|---------|-----------------|
| `prompt`    | Yes      | Text prompt to generate audio (must be URL-encoded).                   |         |                 |
| `model`     | No       | Audio model to use. Automatically set to "openai-audio".               |         | "openai-audio"  |
| `voice`     | No       | Voice option for text-to-speech (e.g., "nova").                          |         | "nova"          |


**Return:** Audio file in MP3 format (Content-Type: audio/mpeg)

**Rate Limits:**

**Example:**

---

## Real-time Feeds API

### Image Feed

`GET https://image.pollinations.ai/feed`

**Description:** SSE stream of user-generated images.

**Example:**

### Text Feed

`GET https://text.pollinations.ai/feed`

**Description:** SSE stream of user-generated text.

**Example:**

---
## Referrer

### API Update (starting **2025.03.12)**

- **Text-To-Image** responses will show the Pollinations.AI logo
- **Text-To-Text** responses will include a link to pollinations.ai

**To eliminate the logo or link**: Add a referrer parameter to your API requests.

- **Web apps**: No change needed - browsers already send referrer information (URL)
- **Bots & backend apps**: You'll need to add this parameter to disable the logo/link - Please use the app name for the referrer value.


### Whitelisting

Projects can request to have their referrer whitelisted to bypass standard rate limits for enhanced API access. Whitelisted domains (including pollinations.ai subdomains) may receive priority queue access and reduced restrictions. [Submit a Domain Whitelisting Request](https://github.com/pollinations/pollinations/issues/new?template=project-submission.yml)

---

## License

Pollinations.AI is open-source software licensed under the [MIT license](LICENSE).

---

Made with ❤️ by the Pollinations.AI team

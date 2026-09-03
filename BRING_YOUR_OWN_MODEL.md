# Publish a Model

Publishing a model lets you connect an endpoint to Pollinations and call it through `gen.pollinations.ai` under an `owner/model` id. Pollinations handles authentication, Pollen billing, model discovery, and routing; the model continues to run on infrastructure you control.

Model publishing and [connecting user wallets](./BRING_YOUR_OWN_POLLEN.md) solve different problems. Model publishing supplies a model to the Pollinations catalog. The wallet flow lets users authorize an app to spend their own Pollen. An app can use either or both.

## Supported Models

| Model family | Required upstream endpoint | Pollinations endpoint |
|---|---|---|
| Text | `POST /v1/chat/completions` | `POST /v1/chat/completions` |
| Image | `POST /v1/images/generations` | `GET /image/{prompt}` or `POST /v1/images/generations` |
| Image editing | `POST /v1/images/edits` in addition to image generation | `POST /v1/images/edits` |
| Video | Exact endpoint URL entered at registration | `GET /video/{prompt}`, `GET /image/{prompt}`, or `POST /v1/images/generations` |
| Text to speech | `POST /v1/audio/speech` | `POST /v1/audio/speech` or `GET /audio/{text}` |
| Speech to text | `POST /v1/audio/transcriptions` | `POST /v1/audio/transcriptions` |
| Embeddings | `POST /v1/embeddings` | `POST /v1/embeddings` |

Image providers must return `b64_json`. During testing, Pollinations checks whether an image provider supports edits and whether it reports OpenAI image-token usage.

Video generation is synchronous. Pollinations calls the exact URL entered at registration with a required numeric `duration`:

```json
{
  "prompt": "A green sprout moving in the breeze",
  "duration": 4,
  "image": ["https://example.com/start.jpg", "https://example.com/end.jpg"],
  "reference_images": ["https://example.com/style.jpg"],
  "reference_videos": ["https://example.com/motion.mp4"],
  "reference_audios": ["https://example.com/audio.mp3"]
}
```

Only supplied fields are included. In `image`, the first URL is the start frame and the second is the end frame. The `reference_*` arrays are general guidance rather than frame controls. Publishers select the accepted image, video, and audio input types when registering the model; unsupported combinations should return an error.

Return one completed MP4 within 300 seconds as `b64_json` or a public `url`:

```json
{
  "data": [
    {
      "url": "https://video-provider.example/output/clip.mp4"
    }
  ]
}
```

Pollinations sends no upstream model id and bills the accepted request duration. Inline and downloaded responses are limited to 20 MB. Do not return an async job id; polling must finish inside the publisher endpoint before it responds.

Realtime and 3D endpoints cannot currently be registered through this workflow.

## Private and Public Models

Any signed-in user can register and call a private model. Private models are owner-only, do not appear in the public catalog, and are free at the Pollinations layer.

Publishing a model requires account-level community publisher access while community model publishing is in alpha. Submit a [publisher access request](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml); the request enables public publishing for the account but does not register a model for you.

Public models appear in the model catalog and can be called by other Pollinations users. Owners set public pricing:

- Text models use the token categories reported by the upstream endpoint.
- Image models use per-token pricing when the registration test finds valid OpenAI image usage; otherwise they use a fixed price per generated image.
- Video models are priced from the requested duration in seconds.
- Speech models are priced per 1M input characters (completionAudioPrice).
- Transcription models are priced from reported audio duration.
- Embedding models use the prompt-token count reported by the upstream endpoint.
- A zero price makes the public model free.

Owners receive 75% of the Pollen spent on their models. Paid and Quest Pollen earnings remain in their respective wallet buckets. Cash payouts are not currently available.

## Register in the Dashboard

1. Open [My Models](https://enter.pollinations.ai/my-models).
2. Choose **Add model**.
3. Select text, image, speech, transcription, or embedding and enter the upstream base URL, model id, and bearer token. For video, enter the exact generation URL and bearer token.
4. Fetch the upstream model list or run the endpoint test before saving.
5. Save the model as private, then call its `owner/model` id through the normal Pollinations endpoint.
6. If your account has publisher access, change visibility to public and set prices when it is ready for other users.

### Model names

Choose a short, stable slug for the model ID (`owner/slug`) and a clear title for the catalog. Keep details that may change, such as price, hosting provider, routing, or context size, out of the slug. Use the description to identify the upstream model or explain what a router or rebranded model does. For example, use `owner/llama-3.1-8b` with the title `Llama 3.1 8B` and the description `Direct proxy to Meta Llama 3.1 8B via Groq`, or `owner/fast-router` with the title `Fast Chat Router` and the description `Routes between Llama and Mistral based on latency`.

The upstream credential is used by Pollinations to proxy requests to your endpoint. Do not place it in a model name, description, public URL, or example.

## Register with the CLI

The CLI manages text, image, video, speech, transcription, and embedding model registrations. Sign in, test the endpoint, then create the model:

```bash
npx @pollinations/cli auth login

npx @pollinations/cli my-models test \
  --modality image \
  --base-url https://api.example.com/v1 \
  --bearer-token "$UPSTREAM_API_KEY" \
  --model image-v1

npx @pollinations/cli my-models create \
  --name my-image \
  --title "My Image" \
  --modality image \
  --image-pricing request \
  --completion-image-price 0.01 \
  --input-modalities text,image \
  --base-url https://api.example.com/v1 \
  --bearer-token "$UPSTREAM_API_KEY" \
  --upstream-model image-v1
```

Use `polli my-models list`, `update`, and `delete` for the rest of the lifecycle. API keys used for model management require the `account:keys` permission.

Embedding models use `--modality embedding`. For example, `--prompt-text-price 0.000001` charges 1 Pollen per 1M input tokens.

## Publishing Controls

Public models support these owner controls in the dashboard or Account API:

- `paidOnly` restricts calls to Paid Pollen.
- `perUserRpm` limits each Pollinations user; `null` removes the limit.
- Text models can declare `advertised.contextLength` and the `tool_calling` or `reasoning` capabilities.
- The provider profile at `POST /account/my-models/provider` sets the public provider name and service URL shared by your models.
- Owners can hide or relist their models without deleting them.

Token prices cannot exceed 50 Pollen per 1M tokens. Fixed image prices cannot exceed 0.25 Pollen per image, video prices cannot exceed 0.5 Pollen per generated second, and transcription prices cannot exceed 0.012 Pollen per minute. See the [Community Models API reference](https://gen.pollinations.ai/docs#tag/community-models) for the exact fields.

## Call Your Model

Use the generated `owner/model` id anywhere the corresponding Pollinations endpoint accepts a model:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "owner/my-model",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Authenticated model-list requests include your own private models. Public discovery endpoints accept `community=true` to return only community models.

## Fallbacks and Health

Public and private community models can nominate up to three compatible community fallbacks. Fallbacks are tried in order and must use the same model family. They must not cost more than the primary model; image fallbacks must also match its pricing mode and support image input when the primary model does. A fallback cannot require Paid Pollen unless the primary model does too.

Pollinations monitors public text and image models using live traffic and active probes. Sustained failures can hide a model from listings while exact-ID calls continue to work. Owners can relist a fixed model, and the monitor can automatically relist models it hid after recovery is verified. View public model health at [model-monitor.pollinations.ai](https://model-monitor.pollinations.ai).

## Trust Boundary

Community models run on the owner's infrastructure, not Pollinations infrastructure. Prompts, input media, and other request content are sent to that upstream provider. Do not send credentials or sensitive information to a community model unless you trust its owner and data handling.

For complete `/account/my-models` request and response schemas, use the [Community Models API reference](https://gen.pollinations.ai/docs#tag/community-models).

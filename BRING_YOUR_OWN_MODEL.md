# Bring Your Own Model

Bring Your Own Model (BYOM) lets you connect an OpenAI-compatible endpoint to Pollinations and call it through `gen.pollinations.ai` under an `owner/model` id. Pollinations handles authentication, Pollen billing, model discovery, and routing; the model continues to run on infrastructure you control.

BYOM and [Bring Your Own Pollen](./BRING_YOUR_OWN_POLLEN.md) solve different problems. BYOM supplies a model to the Pollinations catalog. BYOP lets users authorize an app to spend their own Pollen. An app can use either or both.

## Supported Models

| Model family | Required upstream endpoint | Pollinations endpoint |
|---|---|---|
| Text | `POST /v1/chat/completions` | `POST /v1/chat/completions` |
| Image | `POST /v1/images/generations` | `GET /image/{prompt}` or `POST /v1/images/generations` |
| Image editing | `POST /v1/images/edits` in addition to image generation | `POST /v1/images/edits` |
| Speech to text | `POST /v1/audio/transcriptions` | `POST /v1/audio/transcriptions` |

Image providers must return `b64_json`. During testing, Pollinations checks whether an image provider supports edits and whether it reports OpenAI image-token usage.

Video, text-to-speech, embeddings, realtime, and 3D endpoints cannot currently be registered through BYOM.

## Private and Public Models

Any signed-in user can register and call a private model. Private models are owner-only, do not appear in the public catalog, and are free at the Pollinations layer.

Publishing a model requires account-level community publisher access while BYOM is in alpha. Submit a [publisher access request](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml); the request enables public publishing for the account but does not register a model for you.

Public models appear in the model catalog and can be called by other Pollinations users. Owners set public pricing:

- Text models use the token categories reported by the upstream endpoint.
- Image models use per-token pricing when the registration test finds valid OpenAI image usage; otherwise they use a fixed price per generated image.
- Transcription models are priced from reported audio duration.
- A zero price makes the public model free.

Owners receive 75% of the Pollen spent on their models. Paid and Quest Pollen earnings remain in their respective wallet buckets. Cash payouts are not currently available.

## Register in the Dashboard

1. Open [My Agents & Models](https://enter.pollinations.ai/my-models).
2. Choose **Add model**.
3. Select text, image, or transcription and enter the upstream base URL, model id, and bearer token.
4. Fetch the upstream model list or run the endpoint test before saving.
5. Save the model as private, then call its `owner/model` id through the normal Pollinations endpoint.
6. If your account has publisher access, change visibility to public and set prices when it is ready for other users.

The upstream credential is used by Pollinations to proxy requests to your endpoint. Do not place it in a model name, description, public URL, or example.

## Register with the CLI

The CLI currently manages text and image BYOM entries. Sign in, test the endpoint, then create the model:

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

Use `polli my-models list`, `update`, and `delete` for the rest of the lifecycle. API keys used for model management require the `account:keys` permission. Transcription registration currently uses the dashboard or Account API rather than the CLI.

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

Public and private community models can nominate up to three compatible community fallbacks. Fallbacks are tried in order and must use the same model family. They must not cost more than the primary model; image fallbacks must also match its pricing mode and support image input when the primary model does.

Pollinations monitors public text and image models using live traffic and active probes. Sustained failures can deactivate a model after an owner notification and grace period. Fix and test the upstream endpoint before reactivating it. View public model health at [model-monitor.pollinations.ai](https://model-monitor.pollinations.ai).

## Trust Boundary

Community models run on the owner's infrastructure, not Pollinations infrastructure. Prompts, input media, and other request content are sent to that upstream provider. Do not send credentials or sensitive information to a community model unless you trust its owner and data handling.

For complete `/account/my-models` request and response schemas, use the [Community Models API reference](https://gen.pollinations.ai/docs#tag/community-models).

# Floret Per-Capability Model Overrides

## Overview

Extend Floret's OpenAI-compatible `POST /v1/chat/completions` request with optional per-capability model preferences. The preferences let the `/play` chat UI pin specific models while Floret remains the sole orchestrator for tool choice, multi-step work, and mixed-media responses.

This specification covers the Floret backend only. The `/play` chat interface is an independent, follow-up subsystem and must have its own implementation plan after this contract is deployed and verified.

## Goals

- Keep `model: "floret"` as the public router model.
- Accept optional overrides for text reasoning, web search, image generation, image editing, video generation, and audio generation.
- Treat omitted values and `"auto"` identically: preserve Floret's current router-selected behavior.
- Apply a user-selected override consistently even when the brain proposes a different tool model.
- Reject unknown, unavailable, or capability-incompatible overrides before starting an agent run.
- Preserve streaming, non-streaming, authentication, billing delegation, attachments, and mixed-media output behavior.
- Expose the contract in Floret's README and endpoint example.

## Non-goals

- Building or changing the `/play` chat UI.
- Persisting conversations or model preferences.
- Letting the browser orchestrate Pollinations generation endpoints directly.
- Adding provider-specific generation parameters to the routing object.
- Adding a separate transcription selector in v1.
- Changing model pricing, permissions, or the delegated agent-run-token design.

## Request Contract

The request remains OpenAI-compatible and adds one optional top-level object:

```json
{
  "model": "floret",
  "messages": [
    {"role": "user", "content": "Create a narrated launch concept"}
  ],
  "stream": true,
  "routing": {
    "text": "auto",
    "web_search": "gemini-search",
    "image_generation": "flux",
    "image_editing": "nanobanana",
    "video": "wan-fast",
    "audio": "openai-audio"
  }
}
```

All routing properties are optional strings. The only sentinel is the exact lowercase value `"auto"`. Omitted properties and `"auto"` normalize to no override. Explicit JSON `null`, empty strings, and unknown properties are invalid.

The canonical normalized backend type is:

```python
@dataclass(frozen=True)
class RoutingPreferences:
    text: str | None = None
    web_search: str | None = None
    image_generation: str | None = None
    image_editing: str | None = None
    video: str | None = None
    audio: str | None = None
```

## Capability Semantics

| Routing field | Applies to | Auto behavior |
|---|---|---|
| `text` | The agent brain model passed to every brain completion, including the forced final wrap-up | `settings.brain_model` |
| `web_search` | `web_search` tool calls | Existing `gemini-search` default or a model chosen by the brain |
| `image_generation` | `generate_image` tool calls | Existing prompt-aware `pick_model("image", ...)` behavior or a model chosen by the brain |
| `image_editing` | `edit_image` tool calls | Existing `nanobanana` default or a model chosen by the brain |
| `video` | `generate_video` tool calls | Existing `pick_model("video", ...)` and end-frame compatibility behavior or a model chosen by the brain |
| `audio` | `text_to_speech` tool calls | Existing `openai-audio` default or a model chosen by the brain |

`audio` controls generated audio/TTS only. Transcription remains automatically selected in v1 because the product has one Audio output selector, while transcription models have a separate capability and endpoint contract. A future API can add `transcription` without changing the meaning of `audio`.

An explicit override has higher precedence than a model argument emitted by the brain. For example, if `routing.image_generation` is `"flux"`, every `generate_image` call uses `flux`, even if the brain supplies another `model` value.

## Validation

Validation happens once, before either a streaming or non-streaming run starts.

1. Pydantic rejects unknown routing fields, explicit JSON `null`, non-string values, and empty strings with HTTP 422.
2. `"auto"` is normalized to `None`.
3. Every explicit model ID must exist in the caller-visible response from the authenticated rich `/models` catalog.
4. Every explicit model must satisfy the selected capability using the rich catalog's authoritative `category`, `input_modalities`, `output_modalities`, `capabilities`, and `supported_endpoints` metadata:
   - `text`: text-capable with text output.
   - `web_search`: text-capable and includes the `web_search` capability.
   - `image_generation`: image-capable, accepts text, and outputs images.
   - `image_editing`: image-capable, accepts image input, and outputs images.
   - `video`: video-capable and outputs video.
   - `audio`: accepts text and outputs audio.
5. `supported_endpoints` may be used as additional evidence when present, but its absence must not reject an otherwise compatible model because the public catalog does not populate it consistently for every provider.
6. An invalid explicit override returns HTTP 422 with a stable detail object containing `field`, `model`, and `reason`.

Every request containing at least one explicit override fetches the authenticated rich `/models` catalog with that request's bearer credential, so delegated requests use the same short-lived run token as the eventual brain and tools. This caller-scoped catalog is never read from or written to the shared automatic-routing cache. Fetch failure returns HTTP 503 rather than accepting an override that cannot be validated. Requests with no explicit overrides do not require an additional catalog fetch and preserve current availability behavior.

## Runtime Propagation

`ChatRequest.routing` is normalized into an immutable `RoutingPreferences` value. The API passes it explicitly through:

```text
chat_completions
  -> run_agent / run_agent_events
    -> dispatch
      -> generation/search tool
```

Routing preferences must not be stored in module globals or context variables. Explicit parameters keep concurrent requests isolated and make tests deterministic.

The `text` preference is passed as the `model` argument to the agent loop. Other preferences are passed to `dispatch`, which copies tool arguments and replaces the relevant `model` key before invoking the tool. The original parsed tool-call arguments are not mutated.

## Incompatible Tool Operations

Validation proves that a model supports a broad capability, but an individual tool call can require a narrower feature.

The current example is video end-frame interpolation. If `routing.video` pins a model that is not in `END_FRAME_MODELS` and the brain calls `generate_video` with `end_image`, dispatch returns a normal tool error explaining that the selected model does not support end frames. It must not silently replace the user's explicit model with `wan-fast`. Auto mode retains the current compatible auto-selection behavior.

The error is fed back into the existing agent loop, which can adjust the plan or explain the limitation to the user.

## Brain Guidance

When one or more preferences are explicit, append a short generated block to the Floret system prompt:

```text
User-selected model constraints:
- image generation: flux
- video generation: wan-fast
Use these fixed models for the matching tools. Do not claim that another model was used.
```

This is guidance only. Enforcement remains in code at dispatch time.

## Gateway Compatibility

No generation-gateway change is required.

`RequestData` permits additional top-level properties, `communityEndpointGatewayContext` spreads all request properties except `messages` into transform options, and `genericOpenAIClient` serializes the remaining options into the upstream request body. Therefore `routing` reaches Floret unchanged while the gateway continues replacing the community endpoint bearer with a delegated agent-run token.

A focused gateway regression test is optional but not required for this backend change because the generic forwarding path already covers arbitrary request options. The Floret API tests are the contract authority for `routing`.

## Streaming and Response Compatibility

The response schema does not change.

- Streaming requests continue to return OpenAI `chat.completion.chunk` SSE frames, keepalive comments, and `data: [DONE]`.
- Non-streaming requests continue to return an OpenAI chat completion with text or multimodal content parts.
- Tool progress messages remain visible.
- Routing configuration is not echoed into responses.

## Testing Strategy

Unit tests must cover:

- Pydantic normalization of omitted and `"auto"` values.
- Rejection of unknown fields, explicit JSON `null`, and empty values.
- Rich `/models` wire-shape adaptation, including `web_search` capability metadata and arbitrary model IDs classified by authoritative category/modality metadata.
- Request-scoped registry validation for each capability, stable 422 errors, fresh catalog visibility, and caller/cache isolation.
- Registry-unavailable behavior for explicit overrides.
- Text override reaching every brain call.
- Each tool override winning over a brain-supplied model.
- Auto mode preserving brain-supplied models and existing defaults.
- Concurrent requests carrying different immutable preferences without leakage.
- Explicit incompatible video/end-frame selection producing a tool error without substitution.
- Streaming and non-streaming API paths forwarding identical preferences.
- Existing Floret test suite remaining green.

Live verification after deployment must exercise text, web search, image generation, image editing, video, audio, attachments, mixed output, and at least one explicit override. Paid live generation is not part of routine unit tests.

## Deployment and Rollback

Production deployment must use `.github/workflows/deploy-applications.yml`, which only deploys from the `production` branch and invokes `operations/deployment/deploy.sh apps/floret`. Do not run a local production `wrangler deploy`.

Deployment sequence:

1. Merge the tested Floret change through the repository's normal review path.
2. Promote the approved commit to `production` using the repository's normal release process.
3. Observe the `Deploy / Applications` workflow for `apps/floret`.
4. Verify `https://floret.myceli.ai/health` and `https://floret.pollinations.ai/health` return HTTP 200.
5. Run authenticated smoke requests through the public Pollinations generation endpoint using `model: "floret"`.

Rollback is a revert of the Floret commit followed by the same production workflow. Because `routing` is optional and response formats are unchanged, old clients remain compatible throughout rollout and rollback.

## Security and Cost Boundaries

- Never log bearer tokens or the full request body.
- Do not add or rotate secrets for this feature.
- Continue using the caller-scoped delegated run token for the brain, registry lookup, and all tools.
- Validate model IDs against the caller-visible live registry so a preference cannot bypass model availability or permissions.
- Keep explicit override failures deterministic; do not silently charge for a different model than the user selected.

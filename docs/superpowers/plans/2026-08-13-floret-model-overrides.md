# Floret Model Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add validated per-capability model preferences to Floret's OpenAI-compatible chat endpoint without moving orchestration into the client.

**Architecture:** Parse the optional `routing` request object into an immutable preferences value, validate explicit model IDs against Floret's live registry, and pass the preferences explicitly through the API, agent loop, and tool dispatcher. The brain receives the selected text model and prompt guidance; dispatch enforces tool overrides so a brain-proposed model cannot defeat the user's choice.

**Tech Stack:** Python 3.10+, FastAPI, Pydantic 2, OpenAI Python SDK, httpx, pytest/pytest-asyncio, ruff, mypy, Cloudflare Containers/Workers.

**Spec:** `docs/superpowers/specs/2026-08-13-floret-model-overrides-design.md`

## Global Constraints

- `model: "floret"` remains the public router model.
- The optional routing keys are exactly `text`, `web_search`, `image_generation`, `image_editing`, `video`, and `audio`.
- Omitted properties and exact lowercase `"auto"` mean no override; explicit JSON `null`, empty strings, and unknown properties are invalid.
- Floret remains the sole orchestrator; clients never call selected generation models directly.
- Explicit overrides beat model arguments emitted by the brain.
- `audio` controls generated audio/TTS only; transcription selection remains automatic in v1.
- Explicit incompatible video/end-frame requests return a tool error and never silently substitute another model.
- Routing preferences are passed as immutable values, never stored in module globals or context variables.
- Existing authentication, delegated billing, streaming, response content parts, and ephemeral conversation behavior remain unchanged.
- Production deployment runs only through `.github/workflows/deploy-applications.yml` from the `production` branch; never run local production `wrangler deploy`.
- Do not add, rotate, print, or commit secrets.

## File Structure

- Create `apps/floret/src/floret/routing.py` — owns request normalization, immutable preference types, model-capability validation, override lookup, and prompt-label formatting.
- Create `apps/floret/tests/test_routing.py` — focused unit tests for normalization and registry-backed validation.
- Modify `apps/floret/src/floret/api.py` — adds `routing` to the request schema, validates it under the caller credential, and passes preferences into both execution paths.
- Modify `apps/floret/src/floret/agent.py` — accepts preferences, selects the brain model, appends model-constraint guidance, and passes preferences to dispatch.
- Modify `apps/floret/src/floret/toolset.py` — enforces selected tool models without mutating brain arguments and rejects incompatible pinned video interpolation.
- Modify `apps/floret/src/floret/registry.py` — adds a request-scoped adapter/fetcher for the authenticated rich `/models` catalog without touching the shared automatic-routing cache.
- Modify `apps/floret/tests/test_api_stream.py` — proves streaming/non-streaming API propagation and stable HTTP errors.
- Modify `apps/floret/tests/test_agent_loop.py` — proves brain selection, guidance, dispatch propagation, and request isolation.
- Modify `apps/floret/tests/test_media_tools.py` — proves every tool preference wins over a brain-provided model and auto mode remains unchanged.
- Modify `apps/floret/README.md` — documents the routing contract, precedence, and examples.

---

### Task 1: Normalize and Validate Routing Preferences

**Files:**
- Create: `apps/floret/src/floret/routing.py`
- Create: `apps/floret/tests/test_routing.py`
- Modify: `apps/floret/src/floret/registry.py:243-284`

**Interfaces:**
- Consumes: new request-scoped `await floret.registry.fetch_model_catalog()`, backed by the authenticated rich `/models` endpoint.
- Produces:
  ```python
  class RoutingInput(BaseModel): ...

  @dataclass(frozen=True)
  class RoutingPreferences:
      text: str | None = None
      web_search: str | None = None
      image_generation: str | None = None
      image_editing: str | None = None
      video: str | None = None
      audio: str | None = None

      def explicit(self) -> dict[str, str]: ...
      def model_for_tool(self, tool_name: str) -> str | None: ...
      def prompt_block(self) -> str: ...

  class RoutingValidationError(ValueError):
      field: str
      model: str
      reason: str

  async def validate_routing(
      value: RoutingInput | None,
  ) -> RoutingPreferences: ...
  ```
- `fetch_model_catalog()` fetches and adapts the caller-visible rich `/models` array on every explicit-routing request. It neither reads nor writes `_registry_cache`.

- [ ] **Step 1: Write failing normalization tests**

Create `apps/floret/tests/test_routing.py` with tests that instantiate `RoutingInput` and assert:

```python
from pydantic import ValidationError
import pytest

from floret.routing import RoutingInput, RoutingPreferences


def test_omitted_and_auto_values_normalize_to_none():
    assert RoutingInput().to_preferences() == RoutingPreferences()
    assert RoutingInput(
        text="auto",
        image_generation="auto",
        audio="auto",
    ).to_preferences() == RoutingPreferences()


def test_explicit_values_are_preserved_and_frozen():
    preferences = RoutingInput(
        text="glm",
        image_generation="flux",
    ).to_preferences()
    assert preferences.text == "glm"
    assert preferences.image_generation == "flux"
    with pytest.raises(AttributeError):
        preferences.text = "openai"


@pytest.mark.parametrize("value", ["", " ", 123, None])
def test_invalid_preference_values_are_rejected(value):
    with pytest.raises(ValidationError):
        RoutingInput(text=value)


def test_unknown_routing_fields_are_rejected():
    with pytest.raises(ValidationError):
        RoutingInput.model_validate({"image": "flux"})
```

- [ ] **Step 2: Run normalization tests to verify failure**

Run:

```bash
python -m pytest apps/floret/tests/test_routing.py -q
```

Expected: collection fails because `floret.routing` does not exist.

- [ ] **Step 3: Implement immutable input normalization**

Create `routing.py` with:

```python
from dataclasses import dataclass
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

ModelPreference = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


@dataclass(frozen=True)
class RoutingPreferences:
    text: str | None = None
    web_search: str | None = None
    image_generation: str | None = None
    image_editing: str | None = None
    video: str | None = None
    audio: str | None = None

    def explicit(self) -> dict[str, str]:
        return {
            field: value
            for field, value in self.__dict__.items()
            if value is not None
        }


class RoutingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: ModelPreference | None = None
    web_search: ModelPreference | None = None
    image_generation: ModelPreference | None = None
    image_editing: ModelPreference | None = None
    video: ModelPreference | None = None
    audio: ModelPreference | None = None

    def to_preferences(self) -> RoutingPreferences:
        values = {
            field: None if value == "auto" else value
            for field, value in self.model_dump().items()
        }
        return RoutingPreferences(**values)
```

Add a Pydantic `mode="before"` model validator that rejects keys explicitly supplied as JSON `null`; omitted optional fields still use their defaults. Use `dataclasses.fields()` instead of `__dict__` if mypy reports an issue, while preserving the exact public return type.

- [ ] **Step 4: Run normalization tests to verify pass**

Run:

```bash
python -m pytest apps/floret/tests/test_routing.py -q
```

Expected: all normalization tests pass.

- [ ] **Step 5: Write failing validation tests with an in-memory registry**

Append tests that monkeypatch `routing.fetch_model_catalog`. Use records matching the real rich `/models` array schema (`name`, `category`, `input_modalities`, `output_modalities`, `supported_endpoints`, and list-valued `capabilities`), including `gemini-search` with `web_search` and an arbitrary-ID image model:

```python
_RICH_WIRE_CATALOG = [
    {
        "name": "gemini-search",
        "aliases": ["gemini-search-fast"],
        "category": "text",
        "brand": "Google",
        "pricing": {"currency": "pollen"},
        "title": "Google Gemini Search",
        "input_modalities": ["text", "image", "video"],
        "output_modalities": ["text"],
        "supported_endpoints": ["/v1/chat/completions"],
        "capabilities": ["web_search"],
    },
    {
        "name": "opaque-image-model-7",
        "aliases": [],
        "category": "image",
        "brand": "Example",
        "pricing": {"currency": "pollen"},
        "title": "Opaque Image Model",
        "input_modalities": ["text"],
        "output_modalities": ["image"],
        "supported_endpoints": ["/image/{prompt}"],
        "capabilities": [],
    },
]
```

Cover one success containing all six fields; unknown model; each capability mismatch via parametrization; explicit fetch failure raising `RoutingRegistryUnavailable`; no explicit preferences skipping the fetch; an arbitrary-ID image model classified from metadata; a fresh fetch seeing catalog changes; two caller catalogs remaining isolated; and no read or mutation of `_registry_cache`.

- [ ] **Step 6: Run validation tests to verify failure**

Run:

```bash
python -m pytest apps/floret/tests/test_routing.py -q
```

Expected: failures because the request-scoped rich catalog adapter/fetcher and validation behavior are absent.

- [ ] **Step 7: Add request-scoped rich catalog fetch**

Add a separate adapter and fetcher in `apps/floret/src/floret/registry.py`:

```python
def _adapt_rich_catalog(raw: object) -> dict[str, dict[str, Any]]:
    if not isinstance(raw, list):
        raise ValueError("Model catalog endpoint /models returned a non-array response")
    return {
        model_id: dict(item)
        for item in raw
        if isinstance(item, dict)
        and isinstance(model_id := item.get("id") or item.get("name"), str)
        and model_id
    }


async def fetch_model_catalog() -> dict[str, dict[str, Any]]:
    key = await _resolve_api_key()
    base = settings.openai_base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(f"{base}/models", headers=headers)
        response.raise_for_status()
    return _adapt_rich_catalog(response.json())
```

This function must fetch on every explicit-routing request and must not read or mutate `_registry_cache`. Keep the existing `/v1/models` refresh and shared cache unchanged for automatic model selection.

- [ ] **Step 8: Implement capability validation and stable errors**

In `routing.py`, define frozen requirement data:

```python
@dataclass(frozen=True)
class CapabilityRequirement:
    category: str | None = None
    capability: str | None = None
    required_input: str | None = None
    required_output: str | None = None
    endpoint_when_present: str | None = None


_REQUIREMENTS = {
    "text": CapabilityRequirement(
        category="text",
        required_output="text",
        endpoint_when_present="/v1/chat/completions",
    ),
    "web_search": CapabilityRequirement(
        category="text",
        capability="web_search",
        endpoint_when_present="/v1/chat/completions",
    ),
    "image_generation": CapabilityRequirement(
        category="image",
        required_input="text",
        required_output="image",
        endpoint_when_present="/image/{prompt}",
    ),
    "image_editing": CapabilityRequirement(
        category="image",
        required_input="image",
        required_output="image",
    ),
    "video": CapabilityRequirement(
        category="video",
        required_output="video",
        endpoint_when_present="/video/{prompt}",
    ),
    "audio": CapabilityRequirement(
        required_input="text",
        required_output="audio",
        endpoint_when_present="/v1/chat/completions",
    ),
}
```

Implement `RoutingValidationError` with public `field`, `model`, and `reason` attributes. Implement `RoutingRegistryUnavailable`. `validate_routing()` must return immediately for no explicit values; otherwise call `fetch_model_catalog()` on every request and validate every explicit model against `_REQUIREMENTS`. Use authoritative rich metadata in this order: `category`, `input_modalities`, `output_modalities`, `capabilities`, then `supported_endpoints`. Only fall back to normalized `modalities` when `category` is absent. If `supported_endpoints` is non-empty, require `endpoint_when_present`; if it is absent or empty, do not reject solely on that basis.

- [ ] **Step 9: Add tool lookup and prompt block helpers**

Implement exact mapping:

```python
_TOOL_FIELDS = {
    "generate_image": "image_generation",
    "edit_image": "image_editing",
    "generate_video": "video",
    "text_to_speech": "audio",
    "web_search": "web_search",
}

_FIELD_LABELS = {
    "text": "text reasoning",
    "web_search": "web search",
    "image_generation": "image generation",
    "image_editing": "image editing",
    "video": "video generation",
    "audio": "audio generation",
}
```

`model_for_tool()` returns the matching override or `None`. `prompt_block()` returns `""` when nothing is explicit; otherwise it returns a deterministic newline-prefixed `User-selected model constraints:` block in dataclass field order and ends exactly with `Use these fixed models for the matching tools. Do not claim that another model was used.`

- [ ] **Step 10: Run routing tests, formatting, lint, and type checking**

Run:

```bash
python -m pytest apps/floret/tests/test_routing.py -q
python -m ruff format apps/floret/src/floret/routing.py apps/floret/src/floret/registry.py apps/floret/tests/test_routing.py
python -m ruff check apps/floret/src/floret/routing.py apps/floret/src/floret/registry.py apps/floret/tests/test_routing.py
python -m mypy apps/floret/src/floret/routing.py apps/floret/src/floret/registry.py
```

Expected: all commands pass.

- [ ] **Step 11: Commit Task 1**

```bash
git add apps/floret/src/floret/routing.py apps/floret/src/floret/registry.py apps/floret/tests/test_routing.py
git commit -m "feat(floret): validate model routing preferences"
```

---

### Task 2: Enforce Overrides in the Agent and Tool Dispatcher

**Files:**
- Modify: `apps/floret/src/floret/agent.py:12-215`
- Modify: `apps/floret/src/floret/toolset.py:1-342`
- Modify: `apps/floret/tests/test_agent_loop.py`
- Modify: `apps/floret/tests/test_media_tools.py`

**Interfaces:**
- Consumes: `RoutingPreferences`, `RoutingPreferences.model_for_tool()`, and `RoutingPreferences.prompt_block()` from Task 1.
- Produces:
  ```python
  async def dispatch(
      name: str,
      args: dict[str, Any],
      routing: RoutingPreferences | None = None,
  ) -> ToolResult: ...

  async def run_agent_events(
      messages: list[dict[str, Any]],
      *,
      model: str | None = None,
      max_iters: int | None = None,
      routing: RoutingPreferences | None = None,
  ): ...

  async def run_agent(
      messages: list[dict[str, Any]],
      *,
      model: str | None = None,
      max_iters: int | None = None,
      routing: RoutingPreferences | None = None,
  ) -> dict[str, Any]: ...
  ```

- [ ] **Step 1: Write failing dispatcher precedence tests**

In `test_media_tools.py`, monkeypatch each generation function with an async spy and call `toolset.dispatch()` with both a brain model and an explicit routing preference. Assert the spy receives the routing model for:

```python
@pytest.mark.parametrize(
    ("tool_name", "field", "function_name", "args", "selected"),
    [
        ("generate_image", "image_generation", "generate_image", {"prompt": "x", "model": "brain-image"}, "flux"),
        ("edit_image", "image_editing", "edit_image", {"prompt": "x", "image_url": "https://x/a.jpg", "model": "brain-edit"}, "nanobanana"),
        ("generate_video", "video", "generate_video", {"prompt": "x", "model": "brain-video"}, "wan-fast"),
        ("text_to_speech", "audio", "text_to_speech", {"text": "x", "model": "brain-audio"}, "openai-audio"),
        ("web_search", "web_search", "web_search", {"query": "x", "model": "brain-search"}, "gemini-search"),
    ],
)
```

Also assert the original `args` dictionary still contains the brain model after dispatch returns.

- [ ] **Step 2: Write failing auto-mode and compatibility tests**

Add tests proving:

```python
async def test_dispatch_without_override_preserves_brain_model(...): ...

async def test_pinned_video_model_rejects_unsupported_end_frame(monkeypatch):
    routing = RoutingPreferences(video="wan")
    result = await toolset.dispatch(
        "generate_video",
        {
            "prompt": "morph",
            "image": "https://x/a.jpg",
            "end_image": "https://x/b.jpg",
        },
        routing,
    )
    assert result.artifacts == []
    assert result.brain.startswith("ERROR")
    assert "wan" in result.brain
    assert "end frame" in result.brain.lower()
```

The patched `generate_video` spy must not be called in the incompatible case.

- [ ] **Step 3: Run dispatcher tests to verify failure**

Run the exact new test node IDs in `test_media_tools.py` with `pytest -q`. Expected: signature/behavior failures because dispatch has no routing parameter.

- [ ] **Step 4: Implement dispatch enforcement**

In `toolset.py`:

```python
from floret.routing import RoutingPreferences


async def dispatch(
    name: str,
    args: dict[str, Any],
    routing: RoutingPreferences | None = None,
) -> ToolResult:
    call_args = dict(args)
    selected_model = routing.model_for_tool(name) if routing else None
    if selected_model:
        call_args["model"] = selected_model
```

Use `call_args` for every generation/search tool invocation. Before calling `gen.generate_video`, return a `ToolResult` error when a pinned video model is incompatible with a present `end_image`. Auto mode must continue reaching `gen.generate_video()` unchanged so its existing `wan-fast` fallback remains intact.

- [ ] **Step 5: Run dispatcher tests to verify pass**

Run:

```bash
python -m pytest apps/floret/tests/test_media_tools.py apps/floret/tests/test_video_frames.py -q
```

Expected: all tests pass, including the existing auto-selection test in `test_video_frames.py`.

- [ ] **Step 6: Write failing agent propagation tests**

In `test_agent_loop.py` add:

1. A brain-model test with `RoutingPreferences(text="openai-large")`; assert every `_FakeBrain` call receives `model="openai-large"`, including the post-cap final call.
2. A prompt test; assert the first system message contains `image generation: flux` and excludes unset fields.
3. A dispatch test; monkeypatch `dispatch(name, args, routing=None)`, run an image tool call, and assert the exact immutable routing object reaches dispatch.
4. An isolation test; run two `run_agent()` calls concurrently with different image preferences and assert each dispatch invocation sees only its own preference.

Update `_FakeBrain.calls` to record the complete keyword arguments as well as messages, or add a parallel `kwargs_calls` list without breaking existing assertions.

- [ ] **Step 7: Run agent tests to verify failure**

Run the four new test node IDs with `pytest -q`. Expected: failures because agent signatures and dispatch calls do not carry routing.

- [ ] **Step 8: Implement agent propagation and guidance**

In `agent.py`:

```python
from floret.routing import RoutingPreferences

routing = routing or RoutingPreferences()
model = routing.text or model or settings.brain_model
system_prompt = build_system_prompt() + routing.prompt_block()
```

Pass `routing` to every `dispatch` invocation. Pass `routing` from `run_agent()` into `run_agent_events()`. Keep all existing defaults and event shapes unchanged.

- [ ] **Step 9: Run agent, tool, lint, and type checks**

Run:

```bash
python -m pytest apps/floret/tests/test_agent_loop.py apps/floret/tests/test_media_tools.py apps/floret/tests/test_video_frames.py -q
python -m ruff format apps/floret/src/floret/agent.py apps/floret/src/floret/toolset.py apps/floret/tests/test_agent_loop.py apps/floret/tests/test_media_tools.py
python -m ruff check apps/floret/src/floret/agent.py apps/floret/src/floret/toolset.py apps/floret/tests/test_agent_loop.py apps/floret/tests/test_media_tools.py
python -m mypy apps/floret/src/floret/agent.py apps/floret/src/floret/toolset.py
```

Expected: all commands pass.

- [ ] **Step 10: Commit Task 2**

```bash
git add apps/floret/src/floret/agent.py apps/floret/src/floret/toolset.py apps/floret/tests/test_agent_loop.py apps/floret/tests/test_media_tools.py
git commit -m "feat(floret): enforce capability model overrides"
```

---

### Task 3: Add the Routing Contract to the HTTP API

**Files:**
- Modify: `apps/floret/src/floret/api.py:15-360`
- Modify: `apps/floret/tests/test_api_stream.py`

**Interfaces:**
- Consumes: `RoutingInput`, `RoutingPreferences`, `RoutingValidationError`, `RoutingRegistryUnavailable`, and `validate_routing()` from Task 1; routing-aware agent functions from Task 2.
- Produces: `ChatRequest.routing: RoutingInput | None`; HTTP 422 stable override errors; HTTP 503 registry-unavailable errors; identical routing propagation for stream and non-stream execution.

- [ ] **Step 1: Write failing request-schema tests**

Add tests to `test_api_stream.py`:

```python
def test_unknown_routing_key_is_rejected():
    body = _request_body(stream=False) | {"routing": {"image": "flux"}}
    response = TestClient(api_mod.app).post(
        "/v1/chat/completions", json=body, headers=_HEADERS
    )
    assert response.status_code == 422


def test_empty_routing_value_is_rejected():
    body = _request_body(stream=False) | {"routing": {"video": " "}}
    response = TestClient(api_mod.app).post(
        "/v1/chat/completions", json=body, headers=_HEADERS
    )
    assert response.status_code == 422
```

- [ ] **Step 2: Write failing validation error tests**

Monkeypatch `api_mod.validate_routing` to raise:

```python
RoutingValidationError(
    field="video",
    model="flux",
    reason="model does not support video generation",
)
```

Assert HTTP 422 and exact JSON:

```json
{
  "detail": {
    "field": "video",
    "model": "flux",
    "reason": "model does not support video generation"
  }
}
```

Add a registry unavailable test that raises `RoutingRegistryUnavailable("model registry unavailable")` and asserts HTTP 503 with that detail string.

- [ ] **Step 3: Write failing propagation tests for both API modes**

For non-streaming, monkeypatch `validate_routing` to return `RoutingPreferences(image_generation="flux")`, capture the `routing` keyword passed to `run_agent`, and assert identity/equality.

For streaming, monkeypatch `_sse_events` with an async generator or monkeypatch `run_agent_events` and capture the `routing` keyword; consume the stream and assert the same preference arrives before `[DONE]`.

- [ ] **Step 4: Run new API tests to verify failure**

Run the new test node IDs with `pytest -q`. Expected: failures because `ChatRequest` ignores/does not expose routing and the API does not validate or propagate it.

- [ ] **Step 5: Add request schema and error translation**

In `api.py`:

```python
from floret.routing import (
    RoutingInput,
    RoutingPreferences,
    RoutingRegistryUnavailable,
    RoutingValidationError,
    validate_routing,
)


class ChatRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    stream: bool = False
    routing: RoutingInput | None = None
```

After authentication and before choosing stream/non-stream execution, set `_api_key_override` temporarily while awaiting `validate_routing(request.routing)` so registry lookup uses the caller's credential. Translate the two domain errors to HTTP 422 and 503 exactly as tested, and reset the token in `finally`.

- [ ] **Step 6: Pass preferences through streaming**

Change `_sse_events` to accept `routing: RoutingPreferences`, then call:

```python
async for event in run_agent_events(messages, routing=routing):
```

Pass the validated value from `chat_completions()` into `_sse_events()`.

- [ ] **Step 7: Pass preferences through non-streaming**

Call:

```python
result = await run_agent(
    _to_openai_messages(request.messages),
    routing=routing,
)
```

Do not change response shape or echoed `model`.

- [ ] **Step 8: Update the GET endpoint example**

Add this optional object to the example body at `GET /v1/chat/completions`:

```python
"routing": {
    "text": "auto",
    "web_search": "auto",
    "image_generation": "auto",
    "image_editing": "auto",
    "video": "auto",
    "audio": "auto",
},
```

- [ ] **Step 9: Run API and full Floret tests**

Run:

```bash
python -m pytest apps/floret/tests/test_api_stream.py apps/floret/tests/test_api_content.py -q
python -m pytest apps/floret/tests -q -m "not live"
```

Expected: all non-live tests pass. If live tests are not marked, run the explicit unit-file list instead and record that `test_live.py` was intentionally excluded because it spends external resources.

- [ ] **Step 10: Run formatting, lint, and type checks**

Run:

```bash
python -m ruff format apps/floret/src/floret/api.py apps/floret/tests/test_api_stream.py
python -m ruff check apps/floret/src/floret apps/floret/tests
python -m mypy apps/floret/src/floret
```

Expected: all commands pass.

- [ ] **Step 11: Commit Task 3**

```bash
git add apps/floret/src/floret/api.py apps/floret/tests/test_api_stream.py
git commit -m "feat(floret): expose routing preferences in chat API"
```

---

### Task 4: Document, Verify, and Prepare Production Release

**Files:**
- Modify: `apps/floret/README.md:9-35`
- Modify: `docs/superpowers/specs/2026-08-13-floret-model-overrides-design.md` only if implementation reveals a contract correction
- Verify: `.github/workflows/deploy-applications.yml`
- Verify: `operations/deployment/deploy.sh`

**Interfaces:**
- Consumes: completed HTTP contract from Task 3.
- Produces: user/developer documentation, a clean test report, and a release checklist. It does not perform an unapproved production deployment.

- [ ] **Step 1: Add the request example to the README**

Under `## Running`, add `## API` before `## Configuration` with this complete example:

```bash
curl https://floret.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "floret",
    "messages": [{"role": "user", "content": "Create a narrated launch concept"}],
    "stream": true,
    "routing": {
      "text": "auto",
      "web_search": "gemini-search",
      "image_generation": "flux",
      "image_editing": "nanobanana",
      "video": "wan-fast",
      "audio": "openai-audio"
    }
  }'
```

State immediately below it:

- Every field is optional.
- Omitted/`auto` lets Floret select.
- Explicit selections override any tool model proposed by the brain.
- `audio` is TTS/audio generation, not transcription.
- Invalid/incompatible IDs return 422 before work begins.

- [ ] **Step 2: Run final backend verification**

Run:

```bash
python -m pytest \
  apps/floret/tests/test_routing.py \
  apps/floret/tests/test_agent_loop.py \
  apps/floret/tests/test_api_content.py \
  apps/floret/tests/test_api_stream.py \
  apps/floret/tests/test_config.py \
  apps/floret/tests/test_fetch_retry.py \
  apps/floret/tests/test_media_tools.py \
  apps/floret/tests/test_smoke.py \
  apps/floret/tests/test_video_frames.py -q
python -m ruff check apps/floret/src/floret apps/floret/tests
python -m mypy apps/floret/src/floret
```

Expected: all commands pass. Record exact counts in the PR description.

- [ ] **Step 3: Inspect the final diff for scope and secrets**

Run:

```bash
git diff --check
git diff --stat origin/main...HEAD
git status --short
```

Confirm the only tracked changes are the Floret source/tests/README plus the spec and plan. Confirm none of the pre-existing untracked files are staged.

- [ ] **Step 4: Commit documentation**

```bash
git add apps/floret/README.md docs/superpowers/specs/2026-08-13-floret-model-overrides-design.md docs/superpowers/plans/2026-08-13-floret-model-overrides.md
git commit -m "docs(floret): describe capability model routing"
```

- [ ] **Step 5: Prepare the PR summary**

The PR description must include:

```markdown
## Summary
- add optional validated `routing` preferences to Floret chat completions
- enforce selected models in the brain and tool dispatcher
- preserve auto routing and OpenAI-compatible response behavior

## Test plan
- [ ] Floret unit suite
- [ ] ruff check
- [ ] mypy
- [ ] post-deploy authenticated smoke matrix

## Production
Deployment is handled by `Deploy / Applications` from `production`; no local wrangler deployment.
```

- [ ] **Step 6: Stop before outward-facing actions unless authorized**

Do not push, open a PR, merge, promote to `production`, dispatch a workflow, or spend a live API key unless the user explicitly authorizes that action. Present the clean branch, commits, and test results for review.

- [ ] **Step 7: After explicit release authorization, verify deployment workflow**

Use the repository's normal promotion process. Confirm the workflow selects `apps/floret`, then verify both health endpoints return HTTP 200:

```text
https://floret.myceli.ai/health
https://floret.pollinations.ai/health
```

Do not expose credentials in command output or logs.

- [ ] **Step 8: Run the authenticated post-deploy smoke matrix**

Through the public generation API with `model: "floret"`, verify:

1. Text-only request with all routing values auto.
2. Text request with an explicit text model.
3. Web-search request with explicit `web_search`.
4. Image generation with explicit `image_generation`.
5. Image attachment plus edit instruction with explicit `image_editing`.
6. Video request with explicit `video`.
7. Audio narration with explicit `audio`.
8. Mixed image + text or video + text response.
9. Invalid capability combination returns 422 before streaming starts.

Record status, response modality, and selected test model for each case, but never record the bearer token or full private prompt content.

- [ ] **Step 9: Roll back on contract regression**

If authentication, delegated billing, SSE termination, media content parts, or auto routing regress, revert the feature commits and use the same `production` deployment workflow. Do not patch production with a local Wrangler command.

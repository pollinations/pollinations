# Floret

Autonomous multimodal creative agent running on [Pollinations](https://pollinations.ai). Give it one input; it decides everything else — which model to use, whether the answer is text, an image, audio, a video, or several of those together — and returns them in a single response.

Where [`polli`](../polli) is a Discord/GitHub assistant, `floret` is a router: an OpenAI-compatible `/v1/chat/completions` endpoint (streaming supported) backed by a tool-calling loop that generates images and video, synthesises and transcribes speech, searches the web, generates downloadable 3D assets, and uses the official Computer and FFmpeg MCP services — chaining them freely to satisfy a request across any modality.

Given a prompt like *"make a 20-second continuous video of a paper boat drifting down a rain gutter,"* the agent will: generate keyframes, render clips between them, extract the real last frame of each clip (video models drift from the requested end frame), re-encode it as the next clip's start frame, trim duplicate boundary frames, and stitch the result — publishing the final file to public hosting.

## How it works

- **Brain**: an OpenAI-compatible tool-calling model (default `z-ai/glm-5.3-flash`) drives the loop in `agent.py`, calling tools until it produces a final answer. Repeated identical tool calls or consecutive tool errors inject corrective guidance instead of killing the run; a final answer that references unpublished workspace files triggers one reminder to publish them.
- **Tools** (`tools/`): text/image/video/audio generation, image editing, voice transformation/isolation, transcription, web search, `generate_3d` (text/image input according to model capability), `bash` (Computer MCP), `runFfmpeg` (FFmpeg MCP), and `upload_media` (data URI or authenticated URL to public media hosting). 3D assets and other files are returned as download links.
- **API** (`api.py`): FastAPI app exposing `/v1/chat/completions` (OpenAI-compatible request/response, SSE streaming with keepalives for long multi-clip runs), `/v1/models`, `/health`.
- **Computer MCP**: `bash` calls `/mcp/computer` with caller-scoped authentication outside the command. `/workspace` persists per account, so use unique project folders; `/tmp` is cleared each call. Shell utilities are available, but not Python, Node, package installs, native FFmpeg, or GUI control. Publish files with `assets publish <path>`.
- **FFmpeg MCP**: `runFfmpeg` calls `/mcp/ffmpeg` with public HTTPS sources, referenced as `input0`, `input1`, etc. Its output is already hosted. Publish authenticated generation URLs with `upload_media` first. Computer and uploaded media links have approximately 30-day retention.
- **Catalog**: a shared Durable Object refreshes public model metadata. The agent reads its latest snapshot before each request. Automated advisory reviews are not triggered by caller requests; enabling them requires a separately approved funding model.

## Running

```bash
pip install -e ".[dev]"
cp .env.example .env   # set OPENAI_API_KEY to a Pollinations API key
uvicorn floret.api:app --reload
```

Or via Docker:

```bash
docker build -t floret .
docker run -p 8000:8000 --env-file .env floret
```

The container needs no baked-in secrets. Hosted calls pass a short-lived agent run token via `Authorization: Bearer ag_…`; `OPENAI_API_KEY` is available only for local/dev use when `POLLI_ALLOW_OPERATOR_KEY=true`.

## API

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "pollinations-router/floret",
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

Users authenticate to `gen.pollinations.ai` with their normal `pk_` or `sk_` key. The gateway calls Floret with a short-lived internal `ag_` token; Floret's direct endpoint rejects user keys.

Non-streaming responses keep `choices[0].message.content` as Markdown text. Ordered typed media attachments are available in `message.content_blocks`. Set `stream_options: {"include_usage": true}` to receive a terminal usage chunk before `[DONE]`; Floret reports zero wrapper usage because downstream generation is accounted for separately.

For the `routing` object:

- Every field is optional.
- Omitted/`auto` lets Floret select; an explicitly supplied JSON `null` is invalid.
- Explicit selections override any tool model proposed by the brain.
- `audio` is TTS/audio generation, not transcription.
- Invalid/incompatible IDs return 422 before work begins.

## Configuration

See `.env.example`. Settings are read via `pydantic-settings`; most are `POLLI_`-prefixed (`POLLI_BRAIN_MODEL`, `POLLI_MAX_CONCURRENCY`, ...), while `OPENAI_API_KEY`/`OPENAI_BASE_URL` follow the OpenAI SDK's own convention.

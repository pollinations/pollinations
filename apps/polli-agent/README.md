# polli-agent

Autonomous multimodal creative agent running on [Pollinations](https://pollinations.ai). Give it one input; it decides everything else — which model to use, whether the answer is text, an image, audio, a video, or several of those together — and returns them in a single response.

Where [`polli`](../polli) is a Discord/GitHub assistant, `polli-agent` is a router: an OpenAI-compatible `/v1/chat/completions` endpoint (streaming supported) backed by a tool-calling loop that generates images and video, synthesises and transcribes speech, searches the web, and runs shell commands (ffmpeg included) — chaining them freely to satisfy a request across any modality.

Given a prompt like *"make a 20-second continuous video of a paper boat drifting down a rain gutter,"* the agent will: generate keyframes, render clips between them, extract the real last frame of each clip (video models drift from the requested end frame), re-encode it as the next clip's start frame, trim duplicate boundary frames, and stitch the result — publishing the final file to public hosting.

## How it works

- **Brain**: an OpenAI-compatible tool-calling model (default `glm`) drives the loop in `agent.py`, calling tools until it produces a final answer. Repeated identical tool calls or consecutive tool errors inject corrective guidance instead of killing the run; a final answer that references unpublished workspace files is rejected until the agent actually uploads them.
- **Tools** (`tools/`): `generate_image`, `edit_image` (real img2img), `generate_video` (text-to-video, image-to-video, start+end-frame interpolation), `text_to_speech` (verbatim narration), `transcribe`, `web_search`, `bash` (sandboxed shell with ffmpeg), `upload_media`/`fetch_media` (Pollinations media hosting — the plumbing that lets edited images and extracted frames flow back into video generation as public URLs).
- **API** (`api.py`): FastAPI app exposing `/v1/chat/completions` (OpenAI-compatible request/response, SSE streaming with keepalives for long multi-clip runs), `/v1/models`, `/health`.

## Running

```bash
pip install -e ".[dev]"
cp .env.example .env   # set OPENAI_API_KEY to a Pollinations API key
uvicorn polli_agent.api:app --reload
```

Or via Docker:

```bash
docker build -t polli-agent .
docker run -p 8000:8000 --env-file .env polli-agent
```

The container needs no baked-in secrets — pass your Pollinations key per-request via `Authorization: Bearer <key>`, or set `OPENAI_API_KEY` for local/dev use.

## Configuration

See `.env.example`. Settings are read via `pydantic-settings`; most are `POLLI_`-prefixed (`POLLI_BRAIN_MODEL`, `POLLI_MAX_CONCURRENCY`, ...), while `OPENAI_API_KEY`/`OPENAI_BASE_URL` follow the OpenAI SDK's own convention.

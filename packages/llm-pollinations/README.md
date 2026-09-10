# llm-pollinations

A native [Pollinations](https://pollinations.ai) provider plugin for [Simon Willison's `llm`](https://llm.datasette.io/) CLI and Python library. Prompt any Pollinations text model as `pollinations/<model-id>` — streaming, chat, image attachments, and tools included, straight from your terminal.

## Install

```bash
llm install llm-pollinations
```

## Setup

Set your key once (get one at https://enter.pollinations.ai/keys):

```bash
llm keys set pollinations
```

Or export it (the plugin also reads `POLLINATIONS_API_KEY`):

```bash
export POLLINATIONS_API_KEY="sk_..."
```

Prefer a dedicated key? Create one with the [Polli CLI](../polli-cli) and paste it into `llm keys set pollinations`:

```bash
polli keys create --name llm --budget 100

## Usage

```bash
# Discover models (loaded from your authenticated /v1/models catalog)
llm models | grep pollinations

# Prompt (streaming by default)
llm -m pollinations/openai "Explain black holes like I'm five"

# Non-streaming reply
llm -m pollinations/openai "Write a haiku" --no-stream

# Multi-turn chat
llm chat -m pollinations/openai

# Image attachment (vision models only)
llm -m pollinations/openai "What is in this image?" -a photo.jpg
```

Python API:

```python
import llm

model = llm.get_model("pollinations/openai")
print(model.prompt("Say hello").text())
```

Model capabilities (image input, tool calling, reasoning) come from the catalog, so a model only advertises what Pollinations actually supports. The catalog is cached per key for 30 minutes, with a stale-cache fallback when offline.

## Development

```bash
pip install -e .
pip install pytest httpx
pytest
```

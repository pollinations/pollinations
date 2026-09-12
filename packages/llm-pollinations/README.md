# llm-pollinations

A native [Pollinations](https://pollinations.ai) provider plugin for [Simon Willison's `llm`](https://llm.datasette.io/) CLI and Python library.

## Install

```bash
llm install llm-pollinations
```

## Setup

```bash
llm keys set pollinations
```

Or set the environment variable:

```bash
export POLLINATIONS_API_KEY="sk_..."
```

To create a dedicated key via [Polli CLI](../polli-cli):

```bash
polli keys create --name llm --budget 100
```

## Usage

```bash
# List available models
llm models | grep pollinations

# Prompt (streaming by default)
llm -m pollinations/openai "Explain black holes simply"

# Multi-turn chat
llm chat -m pollinations/openai

# Image attachment (vision models only)
llm -m pollinations/openai "What is in this image?" -a photo.jpg

# Non-streaming
llm -m pollinations/openai "Write a haiku" --no-stream
```

Python API:

```python
import llm

model = llm.get_model("pollinations/openai")
print(model.prompt("Say hello").text())
```

Model capabilities (vision, tools, reasoning) come from the catalog, so only supported features are advertised. The catalog is cached per key for 30 minutes with stale-cache fallback when offline.

## Development

```bash
pip install -e .
pip install pytest
pytest
```

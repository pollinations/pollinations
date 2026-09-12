# llm-pollinations

[LLM](https://llm.datasette.io/) plugin for text models hosted by [Pollinations.ai](https://pollinations.ai).

## Installation

```bash
llm install llm-pollinations
```

## Configuration

Set an API key, either as an environment variable:

```bash
export POLLINATIONS_API_KEY=sk_...
```

or stored in LLM's key store:

```bash
llm keys set pollinations
```

Get a key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys), or create a dedicated one with the [Polli CLI](https://github.com/pollinations/pollinations/tree/main/packages/polli-cli):

```bash
polli keys create --name llm-pollinations --budget 5
```

## Usage

Models are loaded from Pollinations' live catalog and registered as `pollinations/<model-id>`:

```bash
llm models list | grep pollinations
llm -m pollinations/openai/gpt-5.4-nano "Explain pollination in one sentence"
```

Vision, tool calling, and reasoning options are only available on models the catalog advertises support for:

```bash
llm -m pollinations/openai/gpt-6-astra -a photo.jpg "What's in this image?"
llm -m pollinations/openai/gpt-6-astra --functions 'def multiply(x: int, y: int) -> int: return x * y' "What is 12 times 7?"
```

The catalog is cached for an hour under LLM's user directory and falls back to the last cached copy if Pollinations is unreachable.

## Python API

```python
import llm

model = llm.get_model("pollinations/openai/gpt-5.4-nano")
response = model.prompt("Explain pollination in one sentence")
print(response.text())
```

## Scope

This plugin only covers Pollinations' OpenAI-compatible chat models via LLM's built-in `Chat`/`AsyncChat` classes — no image generation, embeddings, or a custom auth flow. Streaming, conversations, tools, and attachments are all handled by LLM's OpenAI-compatible base classes.

## Development

```bash
pip install -e . pytest
python -m pytest
```

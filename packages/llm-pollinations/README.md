# llm-pollinations

Pollinations.ai models for [Simon Willison's `llm` CLI](https://llm.datasette.io/) and Python library.

## Installation

```bash
llm install llm-pollinations
```

## Authentication

Set a key using one of the following:

```bash
# Store the key with llm (recommended)
llm keys set pollinations
# Paste: sk_...

# Or export an environment variable
export POLLINATIONS_API_KEY=sk_...
```

To create a dedicated key through the Polli CLI:

```bash
polli keys create --name llm-plugin
# Then run: llm keys set pollinations and paste the sk_... value
```

Keys are managed at https://enter.pollinations.ai/keys.

## Usage

List available models (registered as `pollinations/<model-id>` from the live catalog):

```bash
llm models | grep pollinations
```

Run a prompt:

```bash
llm -m pollinations/openai/gpt-5-nano 'Reply with exactly one word: banana'
```

Python API:

```python
import llm

model = llm.get_model("pollinations/openai/gpt-5-nano")
response = model.prompt("Reply with exactly one word: banana")
print(response.text())
```

Streaming, conversations, tool calling and image attachments are provided by `llm` itself:

```bash
# Image attachment (vision models only)
llm -m pollinations/openai/gpt-5-nano -a image.png 'Describe this image'
```

## Notes

- Models are discovered live from `https://gen.pollinations.ai/v1/models`; there is no hardcoded model list.
- Image input, tool calling and reasoning are advertised per model only when the catalog lists them.
- The catalog is cached on disk for one hour (`llm pollinations models --skip-cache` bypasses the cache). If the network fetch fails, the stale cache is used.
- Models are registered only when a key is configured.

## Development

```bash
pip install -e '.[dev]' || pip install -e . pytest
python -m pytest
```

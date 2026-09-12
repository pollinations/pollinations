# llm-pollinations

[Pollinations](https://pollinations.ai) models for [Simon Willison's llm](https://llm.datasette.io/).

Text models are loaded from the [Pollinations catalog](https://gen.pollinations.ai/v1/models) and registered as `pollinations/<model-id>` — no hardcoded model list. The catalog is cached for an hour in the llm user directory and falls back to a stale copy when Pollinations is unreachable.

Image input, tool calling, reasoning and structured outputs are enabled only when the catalog advertises them for a model.

## Installation

```bash
llm install llm-pollinations
```

## API keys

```bash
llm keys set pollinations
# or: export POLLINATIONS_API_KEY=...
```

Get a key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys), or create a dedicated key with the [Polli CLI](https://github.com/pollinations/pollinations/tree/main/packages/polli-cli):

```bash
npx @pollinations/cli auth login
npx @pollinations/cli keys create --name llm
```

## Usage

```bash
# Pick a model from llm models list (they look like pollinations/openai/gpt-5.4-nano)
llm -m pollinations/openai/gpt-5.4-nano "Say hi in Russian"

# Streaming, chat, vision and tools where the model advertises them
llm -s -m pollinations/openai/gpt-5.4-nano "Tell a joke"
llm chat -m pollinations/openai/gpt-5.4-nano
llm -m "pollinations/<vision-model>" -a photo.jpg "Describe this photo"
llm -T llm_get_time -m "pollinations/<tool-model>" "What time is it?"
```

Python API:

```python
import llm

model = llm.get_model("pollinations/openai/gpt-5.4-nano")
print(model.prompt("Say hi in Russian").text())
```

## Development

```bash
python -m pytest
```

# llm-pollinations

Native [Pollinations](https://pollinations.ai) provider plugin for [Simon Willison's `llm`](https://github.com/simonw/llm) CLI and Python library.

It reuses LLM's OpenAI-compatible `Chat` / `AsyncChat` against `https://gen.pollinations.ai/v1` — streaming, conversations, tools, and attachments all come from the base classes. Compatible text models load from your authenticated `/v1/models` catalog and register as `pollinations/<model-id>` with no hardcoded list.

Out of scope for this first version: image generation, embeddings, custom device-auth flows, configuration UIs, and new Polli CLI integration commands.

## Install

```bash
llm install llm-pollinations
```

Or from this repo:

```bash
llm install -e packages/llm-pollinations
```

Requires a [current `llm` release](https://github.com/simonw/llm) (`>=0.26`).

## Authentication

Direct key setup:

```bash
llm keys set pollinations
# Enter key: <paste a Pollinations secret key>
```

Or via environment:

```bash
export POLLINATIONS_API_KEY="sk_..."
```

Create a dedicated key through [Polli CLI](https://github.com/pollinations/pollinations/tree/main/packages/polli-cli):

```bash
polli keys create --name llm --budget 100
# paste the printed secret into `llm keys set pollinations`
```

Models only register when a key is configured, so the catalog reflects your key's permissions.

## Usage

```bash
llm models list | grep pollinations
llm -m pollinations/openai/gpt-5.4-nano "What is the capital of France?"
llm -m pollinations/openai/gpt-5.4-nano "Stream this" --no-stream
llm -m pollinations/anthropic/claude-haiku-4.5 --chat
```

Image attachments, tool calling, and reasoning are enabled per model only when the catalog advertises them:

```bash
llm -m pollinations/openai/gpt-5.4-nano "Describe this image" -a photo.jpg
llm -m pollinations/qwen/qwen3.8-flash -T llm_time "What time is it?" --tools-debug
llm -m pollinations/openai/gpt-5.4 "Prove dogs exist" -o reasoning_effort high
```

Python API:

```python
import llm
model = llm.get_model("pollinations/openai/gpt-5.4-nano")
print(model.prompt("Hello").text())
```

Catalog commands (5-minute cache with stale-cache fallback):

```bash
llm pollinations models
llm pollinations models --json
llm pollinations refresh
```

## Verification

Against a current `llm` release with a key configured:

```bash
llm -m pollinations/openai/gpt-5.4-nano "Say hi"
llm -m pollinations/openai/gpt-5.4-nano "Count to 5" --no-stream  # streaming path
llm -m pollinations/openai/gpt-5.4-nano --chat                     # chat loop
llm -m pollinations/openai/gpt-5.4-nano "Describe this" -a photo.jpg
llm -m pollinations/qwen/qwen3.8-flash -T llm_time "What time is it?"
python -c "import llm; print(llm.get_model('pollinations/openai/gpt-5.4-nano').prompt('Hi').text())"
pytest packages/llm-pollinations
```

## PyPI & plugin directory

The package is ready for PyPI publication (`python -m build`, `twine upload dist/*`). After merge, submit it upstream with a concise PR to the [LLM plugin directory](https://llm.datasette.io/en/stable/plugins/directory.html) (see [llm-openrouter](https://github.com/simonw/llm-openrouter) for the reference format).

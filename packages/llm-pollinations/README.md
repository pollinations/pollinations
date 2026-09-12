# llm-pollinations

Native [Pollinations](https://pollinations.ai) provider plugin for [Simon Willison's \x60llm\x60](https://github.com/simonw/llm) CLI and Python library.

It reuses LLM's OpenAI-compatible \x60Chat\x60 / \x60AsyncChat\x60 against \x60https://gen.pollinations.ai/v1\x60 — streaming, conversations, tools, and attachments all come from the base classes. Compatible text models load from your authenticated \x60/v1/models\x60 catalog and register as \x60pollinations/<model-id>\x60 with no hardcoded list.

Out of scope for this first version: image generation, embeddings, custom device-auth flows, configuration UIs, and new Polli CLI integration commands.

## Install

\x60\x60\x60bash
llm install llm-pollinations
\x60\x60\x60

Or from this repo:

\x60\x60\x60bash
llm install -e packages/llm-pollinations
\x60\x60\x60

Requires a [current \x60llm\x60 release](https://github.com/simonw/llm) (\x60>=0.26\x60).

## Authentication

Direct key setup:

\x60\x60\x60bash
llm keys set pollinations
# Enter key: <paste a Pollinations secret key>
\x60\x60\x60

Or via environment:

\x60\x60\x60bash
export POLLINATIONS_API_KEY="sk_..."
\x60\x60\x60

Create a dedicated key through [Polli CLI](https://github.com/pollinations/pollinations/tree/main/packages/polli-cli):

\x60\x60\x60bash
polli keys create --name llm --budget 100
# paste the printed secret into \x60llm keys set pollinations\x60
\x60\x60\x60

Models only register when a key is configured, so the catalog reflects your key's permissions.

## Usage

\x60\x60\x60bash
llm models list | grep pollinations
llm -m pollinations/openai/gpt-5.4-nano "What is the capital of France?"
llm -m pollinations/openai/gpt-5.4-nano "Stream this" --no-stream
llm -m pollinations/anthropic/claude-haiku-4.5 --chat
\x60\x60\x60

Image attachments, tool calling, and reasoning are enabled per model only when the catalog advertises them:

\x60\x60\x60bash
llm -m pollinations/openai/gpt-5.4-nano "Describe this image" -a photo.jpg
llm -m pollinations/qwen/qwen3.8-flash -T llm_time "What time is it?" --tools-debug
llm -m pollinations/openai/gpt-5.4 "Prove dogs exist" -o reasoning_effort high
\x60\x60\x60

Python API:

\x60\x60\x60python
import llm
model = llm.get_model("pollinations/openai/gpt-5.4-nano")
print(model.prompt("Hello").text())
\x60\x60\x60

Catalog commands (5-minute cache with stale-cache fallback):

\x60\x60\x60bash
llm pollinations models
llm pollinations models --json
llm pollinations refresh
\x60\x60\x60

The catalog is persisted in a user-level JSON key-value store. Each API key maps to a SHA-256-derived entry, so the raw key is never written and catalogs remain isolated between keys. Stale entries are used when the catalog endpoint is temporarily unavailable.

## Verification

Against a current \x60llm\x60 release with a key configured:

\x60\x60\x60bash
llm -m pollinations/openai/gpt-5.4-nano "Say hi"
llm -m pollinations/openai/gpt-5.4-nano "Count to 5"                  # streaming path
llm -m pollinations/openai/gpt-5.4-nano --chat                     # chat loop
llm -m pollinations/openai/gpt-5.4-nano "Describe this" -a photo.jpg
llm -m pollinations/qwen/qwen3.8-flash -T llm_time "What time is it?"
python -c "import llm; print(llm.get_model('pollinations/openai/gpt-5.4-nano').prompt('Hi').text())"
pytest packages/llm-pollinations
\x60\x60\x60

## PyPI & plugin directory

The package is ready for PyPI publication (\x60python -m build\x60, \x60twine upload dist/*\x60). After merge, submit it upstream with a concise PR to the [LLM plugin directory](https://llm.datasette.io/en/stable/plugins/directory.html) (see [llm-openrouter](https://github.com/simonw/llm-openrouter) for the reference format).

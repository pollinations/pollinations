# llm-pollinations

Pollinations AI provider plugin for Simon Willison's [LLM](https://llm.datasette.io/) CLI and Python library.

Access frontier and open text models hosted on Pollinations AI directly through `llm`.

## Installation

Install this plugin in the same environment as `llm`:

```bash
llm install llm-pollinations
```

Or install locally for development:

```bash
pip install -e packages/llm-pollinations
```

## Authentication

You can authenticate using an existing Pollinations API key or by generating a dedicated key via the Polli CLI.

### Option 1: Direct key setup

Save your key into LLM's key store:

```bash
llm keys set pollinations
```

Or set the environment variable:

```bash
export POLLINATIONS_API_KEY="your_api_key_here"
```

### Option 2: Create a key via Polli CLI

Generate a dedicated API key using the Pollinations CLI ([polli-cli](https://github.com/pollinations/pollinations/tree/main/packages/polli-cli)):

```bash
# Create a dedicated API key named "llm-cli"
polli keys create --name "llm-cli"
```

Or via `npx`:

```bash
npx polli-cli keys create --name "llm-cli"
```

Copy the generated secret key (`sk_...`) and set it via `llm keys set pollinations`.

## Usage

### Listing Available Models

List models available through Pollinations AI:

```bash
llm pollinations models
```

To refresh the local model catalog cache:

```bash
llm pollinations refresh
```

All Pollinations models are registered with the `pollinations/` prefix (e.g. `pollinations/openai/gpt-5.4-nano`, `pollinations/anthropic/claude-sonnet-4.6`).

### Prompting

Run a prompt against a Pollinations model:

```bash
llm -m pollinations/openai/gpt-5.4-nano "Explain quantum entanglement in two sentences"
```

### Interactive Chat

Start a multi-turn chat session:

```bash
llm chat -m pollinations/anthropic/claude-sonnet-4.6
```

### Image Attachments (Vision)

For models with image input support advertised in the catalog:

```bash
llm -m pollinations/openai/gpt-5.4-nano "Describe this image" -a photo.jpg
```

### Tool Calling

For models supporting function/tool calls:

```bash
llm -m pollinations/openai/gpt-5.4-nano "What is the square root of 256?"
```

### Python API Usage

You can use `llm-pollinations` directly in Python scripts:

```python
import llm

model = llm.get_model("pollinations/openai/gpt-5.4-nano")
response = model.prompt("Write a haiku about programming.")
print(response.text())
```

Async execution:

```python
import asyncio
import llm

async def main():
    model = llm.get_async_model("pollinations/anthropic/claude-sonnet-4.6")
    response = await model.prompt("Explain recursion briefly.")
    print(await response.text())

asyncio.run(main())
```

## Features & Architecture

- **Catalog Integration**: Automatically loads models from Pollinations `/v1/models` without hardcoding model lists or risking provider-name collisions.
- **Smart Caching**: Time-limited disk caching (1 hour TTL) at `~/.config/io.datasette.llm/pollinations_models.json` with automatic stale-cache fallback during offline or network error conditions.
- **Dynamic Capabilities**: Image input (vision), tool calling, and reasoning flags are dynamically derived from the model catalog definitions.
- **Native OpenAI Reuse**: Utilizes `llm`'s native `Chat` and `AsyncChat` OpenAI-compatible handlers against `https://gen.pollinations.ai/v1`.

## Upstream Plugin Submission

`llm-pollinations` is ready for PyPI publication and submission to the official LLM plugin directory:
- **PyPI Package**: `llm-pollinations`
- **Plugin Name**: `pollinations`
- **Repository**: `https://github.com/pollinations/pollinations/tree/main/packages/llm-pollinations`

## License

MIT License.

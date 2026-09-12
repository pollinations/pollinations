# llm-pollinations

Pollinations text models for Simon Willison's [LLM](https://llm.datasette.io/) CLI and Python library.

## Install and authenticate

```bash
llm install llm-pollinations
llm keys set pollinations
```

Alternatively set `POLLINATIONS_API_KEY`. Create a dedicated secret key with Polli CLI:

```bash
polli keys create --name llm-pollinations --type secret --budget 5
```

## Use

Models are registered from your authenticated catalog as `pollinations/<model-id>`:

```bash
llm models list | grep pollinations/
llm -m pollinations/openai/gpt-5.4-nano "Explain pollen in one sentence"
llm chat -m pollinations/openai/gpt-5.4-nano
llm -m pollinations/openai/gpt-6-astra -a image.jpg "Describe this image"
llm -m pollinations/openai/gpt-6-astra --functions 'def double(x: int) -> int: return x * 2' "Double 21"
```

Streaming is LLM's default; pass `--no-stream` when needed. In Python:

```python
import llm

model = llm.get_model("pollinations/openai/gpt-5.4-nano")
print(model.prompt("Hello from Python").text())
```

The plugin delegates prompts, conversations, streaming, attachments, and tools to LLM's `Chat` and `AsyncChat` classes. It enables vision, tools, and reasoning only when advertised by `/v1/models`. Catalog results are cached per key for one hour, with stale-cache fallback for temporary failures.

## Develop and publish

```bash
pip install -e ".[test]"
pytest
python -m build
```

The resulting wheel and source archive are ready for PyPI. After publication, submit the package URL and a one-line description to LLM's plugin directory.

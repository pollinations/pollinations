# llm-pollinations

Pollinations text models for Simon Willison's [LLM](https://llm.datasette.io/)
CLI and Python library.

## Install and authenticate

```bash
llm install llm-pollinations
llm keys set pollinations
```

Alternatively, set `POLLINATIONS_API_KEY`. To create a dedicated key with the
[Polli CLI](../polli-cli):

```bash
polli auth login
polli keys create --name llm-pollinations --type secret --budget 5
```

Paste the generated secret into `llm keys set pollinations`.

## Use

Models are loaded from the authenticated catalog and registered as
`pollinations/<model-id>`:

```bash
llm models list | grep pollinations/
llm -m pollinations/openai/gpt-5.4-nano "Explain pollen in one sentence"
llm chat -m pollinations/openai/gpt-5.4-nano
llm -m pollinations/openai/gpt-6-astra -a image.jpg "Describe this image"
llm -m pollinations/openai/gpt-6-astra \
  --functions 'def double(x: int) -> int: return x * 2' "Double 21"
```

Streaming is LLM's default; pass `--no-stream` for a non-streamed response.
The Python API uses the same registered models:

```python
import llm

model = llm.get_model("pollinations/openai/gpt-5.4-nano")
print(model.prompt("Hello from Python").text())
```

The plugin delegates prompting, streaming, conversations, attachments, and
tools to LLM's `Chat` and `AsyncChat` classes. Vision, tools, and reasoning are
enabled only when advertised by `/v1/models`. Catalog results are cached per
key for 15 minutes. Temporary network and server failures use the last cache;
authentication errors do not.

## Develop and publish

```bash
python -m pip install -e ".[test]" build
pytest
python -m build
```

The wheel and source archive are ready for PyPI. After publication, submit the
package to [LLM's plugin directory](https://llm.datasette.io/en/stable/plugins/directory.html).

# llm-pollinations

Pollinations models inside [Simon Willison's `llm`](https://llm.datasette.io/) CLI and Python library.

## Install

```bash
pip install llm-pollinations
```

Requires `llm` 0.24 or newer (it installs automatically).

## Connect a key

Either store a key with llm itself:

```bash
llm keys set pollinations
# paste your key from https://enter.pollinations.ai/keys
```

or export it for one session:

```bash
export POLLINATIONS_API_KEY="sk_..."
```

Prefer a dedicated key? Mint one with the Polli CLI:

```bash
polli keys create --name "llm" --type secret
```

## Use it

```bash
llm -m pollinations/openai "explain quorums in one sentence"
llm -m pollinations/openai "summarise this file" -f README.md
llm chat -m pollinations/openai
```

Models come live from your `/v1/models` catalog as `pollinations/<model-id>` — text models you can call, including community models. Vision, tool calling, and reasoning flags follow whatever the catalog advertises for each model. The catalog is cached for an hour with stale-cache fallback, so a network blip never breaks `llm models`.

```bash
llm models | grep pollinations
```

Python API:

```python
import llm
model = llm.get_model("pollinations/openai")
print(model.prompt("explain quorums in one sentence").text())
```

## For maintainers

```bash
pip install -e ".[test]"  # from packages/llm-pollinations
pytest
```

## Publishing

Standard PyPI flow (`python -m build`, `twine upload dist/*`), then submit the repo URL to the [upstream plugin directory](https://llm.datasette.io/en/stable/plugins/directory.html) with a one-line description.

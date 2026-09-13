# llm-pollinations

An [LLM](https://llm.datasette.io/) plugin for text models hosted by
[Pollinations](https://pollinations.ai/).

## Install and configure

```bash
llm install llm-pollinations
llm keys set pollinations
```

Alternatively set `POLLINATIONS_API_KEY`. A dedicated key can be created with
the Polli CLI using `polli auth login` followed by
`polli keys create --name llm`.

The plugin loads compatible models from the authenticated Pollinations catalog:

```bash
llm models list -q pollinations
llm -m pollinations/openai/gpt-oss-120b "Say hello in one sentence"
```

Catalog results are cached for 15 minutes and an existing cache is used when a
refresh fails. Vision, tools, reasoning, and structured output are exposed only
for models advertising those capabilities.

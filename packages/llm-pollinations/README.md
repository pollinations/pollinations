# llm-pollinations

LLM CLI plugin for [Pollinations AI](https://pollinations.ai).

## Install

```bash
llm install llm-pollinations
```

## Setup

```bash
llm keys set pollinations  # optional — free tier available
```

## Usage

```bash
llm -m pollinations/gpt-5.4-nano "Hello world"
llm -m pollinations/gpt-5.4 "Describe this" -a image.jpg
llm -m pollinations/gpt-5.4-nano "Write code" --stream
llm pollinations-models  # list all models
```

## Features

- Auto-discovered models from `/v1/models`
- Vision, streaming, async, tool calls
- Minimal pass-through to Pollinations API

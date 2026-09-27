#!/usr/bin/env python3
"""Anthropic Python SDK checks for /v1/messages (quest #15490).

Runs against whatever base URL you point it at. Use the local stub first
(python messages-sdk-check.py http://127.0.0.1:8899 mock), then the deployed
gateway after merge (python messages-sdk-check.py https://gen.pollinations.ai <model>).

    python3 messages-sdk-check.py <base_url> <model>

Checks: plain, streamed, tool-use, image.
"""

import sys

from anthropic import Anthropic

base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8899"
model = sys.argv[2] if len(sys.argv) > 2 else "mock"

client = Anthropic(base_url=base_url, auth_token="sk-test", api_key="sk-test")


def show(label: str, value: object) -> None:
    print(f"\n== {label} ==\n{value}")


# 1. plain
plain = client.messages.create(
    model=model,
    max_tokens=64,
    messages=[{"role": "user", "content": "Reply with exactly one word: pong"}],
)
show("plain", {"content": plain.content, "stop_reason": plain.stop_reason, "usage": plain.usage})

# 2. streamed
print("\n== streamed ==")
text = ""
with client.messages.stream(
    model=model,
    max_tokens=64,
    messages=[{"role": "user", "content": "Count 1 to 3."}],
) as stream:
    for event in stream:
        if event.type == "content_block_delta" and event.delta.type == "text_delta":
            text += event.delta.text
print("streamed text:", text.strip())

# 3. tool use
tool = client.messages.create(
    model=model,
    max_tokens=128,
    tools=[
        {
            "name": "get_weather",
            "description": "Get weather for a city.",
            "input_schema": {
                "type": "object",
                "properties": {"city": {"type": "string"}},
                "required": ["city"],
            },
        }
    ],
    messages=[{"role": "user", "content": "Weather in Paris? Use the tool."}],
)
show("tool-use", tool.content)

# 4. image
image = client.messages.create(
    model=model,
    max_tokens=64,
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "What colour is this pixel?"},
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
                    },
                },
            ],
        }
    ],
)
show("image", image.content)

print("\nAll four Messages checks completed.")

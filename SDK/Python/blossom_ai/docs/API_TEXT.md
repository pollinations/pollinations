# 💬 Text API Reference

> **Complete reference for text generation and chat endpoints in Blossom AI**

---

## Overview

The Text API provides comprehensive text generation capabilities through the `TextGenerator` class, accessible via `client.text`. It supports multiple models, chat conversations, streaming, and various output formats.

## Quick Start

```python
from blossom_ai import BlossomClient

async with BlossomClient() as client:
    # Simple generation
    text = await client.text.generate("Write a haiku about programming")
    
    # With parameters
    text = await client.text.generate(
        "Explain quantum computing",
        model="gemini",
        max_tokens=500,
        temperature=0.7
    )
```

---

## Core Methods

### `generate()`

Generate text from a prompt.

```python
await client.text.generate(
    prompt: str,
    model: str = "openai",
    max_tokens: Optional[int] = None,
    temperature: float = 0.7,
    top_p: float = 0.9,
    frequency_penalty: float = 0.0,
    presence_penalty: float = 0.0,
    stop: Optional[Union[str, List[str]]] = None,
    stream: bool = False,
    json_mode: bool = False,
    seed: Optional[int] = None
) -> Union[str, AsyncIterator[str]]
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | `str` | **Required** | Text prompt for generation |
| `model` | `str` | `"openai"` | Model to use (`"openai"`, `"gemini"`, `"claude"`, etc.) |
| `max_tokens` | `int` | `None` | Maximum tokens to generate |
| `temperature` | `float` | `0.7` | Randomness (0.0-2.0) |
| `top_p` | `float` | `0.9` | Nucleus sampling threshold |
| `frequency_penalty` | `float` | `0.0` | Penalty for repeated tokens |
| `presence_penalty` | `float` | `0.0` | Penalty for new topics |
| `stop` | `str/List[str]` | `None` | Stop sequences |
| `stream` | `bool` | `False` | Stream response chunks |
| `json_mode` | `bool` | `False` | Force JSON output |
| `seed` | `int` | `None` | Random seed for reproducibility |

**Returns:**
- `str`: Generated text (when `stream=False`)
- `AsyncIterator[str]`: Text chunks (when `stream=True`)

**Example:**
```python
# Basic generation
text = await client.text.generate("Hello world")

# Advanced generation with parameters
text = await client.text.generate(
    "Write a Python function to calculate fibonacci numbers",
    model="gemini",
    max_tokens=300,
    temperature=0.2,  # More focused/consistent
    top_p=0.95,
    frequency_penalty=0.1
)
```

---

### `chat()`

Generate text in a conversational context with message history.

```python
await client.text.chat(
    messages: List[Dict[str, str]],
    model: str = "openai",
    system: Optional[str] = None,
    **kwargs
) -> str
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `messages` | `List[Dict]` | **Required** | Conversation history |
| `model` | `str` | `"openai"` | Model to use |
| `system` | `str` | `None` | System message (prepended if provided) |
| `**kwargs` | | | Same as `generate()` parameters |

**Message Format:**
```python
messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What's the weather like?"},
    {"role": "assistant", "content": "It's sunny and 75°F."},
    {"role": "user", "content": "What about tomorrow?"}
]
```

**Returns:**
- `str`: Assistant's response

**Example:**
```python
# Simple conversation
messages = [
    {"role": "user", "content": "What is 2 + 2?"}
]
response = await client.text.chat(messages)

# Full conversation with system prompt
messages = [
    {"role": "user", "content": "Write a Python hello world"}
]
response = await client.text.chat(
    messages,
    system="You are a Python expert. Provide clean, well-commented code.",
    model="claude",
    max_tokens=200
)
```

---

### `generate_sync()`

Synchronous version of `generate()`.

```python
client.text.generate_sync(
    prompt: str,
    **kwargs
) -> str
```

**Example:**
```python
# In sync contexts (like scripts)
text = client.text.generate_sync("A simple question")
```

---

### `chat_sync()`

Synchronous version of `chat()`.

```python
client.text.chat_sync(
    messages: List[Dict[str, str]],
    **kwargs
) -> str
```

**Example:**
```python
messages = [{"role": "user", "content": "Hello"}]
response = client.text.chat_sync(messages)
```

---

### `__call__()`

Alias for `generate_sync()` for quick usage.

```python
client.text(prompt: str, **kwargs) -> str
```

**Example:**
```python
# Quick one-liner
text = client.text("What is Python?")
```

---

## Streaming Responses

### Streaming with `stream=True`

When `stream=True`, the method returns an async iterator over text chunks.

```python
async for chunk in await client.text.generate("Write a story", stream=True):
    print(chunk, end="", flush=True)
```

**Example: Real-time streaming**
```python
# Stream a long generation
async def stream_story():
    stream = await client.text.generate(
        "Write a short story about AI",
        max_tokens=1000,
        stream=True
    )
    
    full_text = ""
    async for chunk in stream:
        full_text += chunk
        print(chunk, end="", flush=True)
    
    return full_text

story = await stream_story()
```

**Example: Collect streamed response**
```python
# Collect chunks into full text
stream = await client.text.generate("Hello", stream=True)
chunks = []
async for chunk in stream:
    chunks.append(chunk)
full_text = "".join(chunks)
```

---

## Utility Methods

### `models()`

Get available text generation models.

```python
client.text.models() -> List[str]
```

**Returns:**
- `List[str]`: List of available model names

**Example:**
```python
models = client.text.models()
print(models)  # ['openai', 'gemini', 'claude', 'mistral', ...]
```

---

## Advanced Features

### JSON Mode

Force the model to output valid JSON:

```python
import json

response = await client.text.generate(
    'Return a JSON object with "name" and "age" fields for a person named John who is 30',
    json_mode=True,
    max_tokens=100
)

# Parse the JSON
data = json.loads(response)
print(data)  # {"name": "John", "age": 30}
```

---

### Function Calling

Structured output using tools (coming soon):

```python
# Future feature - structured function calling
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get current weather",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"}
                }
            }
        }
    }
]
```

---

### Message Builder

Helper class for building conversation messages:

```python
from blossom_ai import MessageBuilder

# Build different message types
messages = [
    MessageBuilder.system("You are a helpful coding assistant."),
    MessageBuilder.user("Write a Python function to sort a list"),
    MessageBuilder.assistant("Here's a function using bubble sort..."),
    MessageBuilder.user("Can you make it more efficient?")
]

response = await client.text.chat(messages)
```

**MessageBuilder Methods:**

| Method | Parameters | Description |
|--------|------------|-------------|
| `system(content)` | `content: str` | Create system message |
| `user(content)` | `content: str` | Create user message |
| `assistant(content)` | `content: str` | Create assistant message |
| `image(role, text, image_url, detail)` | Multiple | Create message with image |

---

## Conversational Examples

### Multi-turn Conversation

```python
class Conversation:
    def __init__(self, client, system_prompt=None):
        self.client = client
        self.messages = []
        if system_prompt:
            self.messages.append({"role": "system", "content": system_prompt})
    
    async def say(self, message):
        self.messages.append({"role": "user", "content": message})
        response = await self.client.text.chat(self.messages)
        self.messages.append({"role": "assistant", "content": response})
        return response

# Usage
conv = Conversation(client, "You are a travel advisor.")

response1 = await conv.say("I want to visit Japan.")
response2 = await conv.say("What about in spring?")
response3 = await conv.say("Best places for cherry blossoms?")
```

---

### Code Generation

```python
# Generate Python code with specific requirements
code = await client.text.generate(
    """Write a Python class that implements a LRU cache with:
    - get(key) method
    - put(key, value) method  
    - max_size parameter
    - Thread-safe operations""",
    model="gemini",
    temperature=0.1,  # More deterministic
    max_tokens=400
)
```

---

### Content Summarization

```python
# Summarize long text
async def summarize_text(text, max_length=100):
    summary = await client.text.generate(
        f"Summarize the following text in no more than {max_length} words:\n\n{text}",
        max_tokens=max_length,
        temperature=0.3
    )
    return summary

# Summarize multiple documents
documents = [doc1, doc2, doc3]
summaries = await asyncio.gather(*[
    summarize_text(doc) for doc in documents
])
```

---

## Error Handling

Common errors and solutions:

```python
from blossom_ai import (
    ValidationError, RateLimitError, 
    EmptyResponseError, TimeoutError
)

try:
    text = await client.text.generate("Hello world")
except ValidationError as e:
    print(f"Invalid parameters: {e}")
except RateLimitError as e:
    print(f"Rate limited. Wait {e.retry_after} seconds")
except EmptyResponseError as e:
    print("Model returned empty response")
except TimeoutError as e:
    print("Request timed out")
except Exception as e:
    print(f"Unexpected error: {e}")
```

---

## Performance Tips

| Technique | Impact | Description |
|-----------|--------|-------------|
| **Lower max_tokens** | High | Faster generation, lower cost |
| **Higher temperature** | Medium | More creative but potentially slower |
| **Streaming** | Medium | Perceived faster response |
| **Caching** | High | Instant repeated requests |
| **Batch requests** | Medium | Better throughput |

---

## Model Comparison

| Model | Strengths | Best For |
|-------|-----------|----------|
| `openai` | Balanced performance | General purpose |
| `gemini` | Creative writing | Stories, poetry |
| `claude` | Technical content | Code, analysis |
| `mistral` | Fast responses | Quick answers |

---

## Best Practices

### 1. Use Appropriate Temperature

```python
# For factual content (low temperature)
facts = await client.text.generate(
    "List 5 Python built-in data types",
    temperature=0.1
)

# For creative content (higher temperature)
creative = await client.text.generate(
    "Write a short story about AI",
    temperature=0.9
)
```

### 2. Handle Long Responses

```python
# Stream long responses to avoid timeouts
async for chunk in await client.text.generate(
    "Write a detailed essay...",
    max_tokens=2000,
    stream=True
):
    process(chunk)
```

### 3. Use System Messages

```python
# Set context with system messages
messages = [
    {"role": "system", "content": "You are a senior Python developer."},
    {"role": "user", "content": "Review this code..."}
]
response = await client.text.chat(messages)
```

### 4. Validate JSON Output

```python
import json

response = await client.text.generate(
    'Return JSON: {"status": "success"}',
    json_mode=True
)

try:
    data = json.loads(response)
    print("Valid JSON received")
except json.JSONDecodeError:
    print("Invalid JSON - handle error")
```

---

## See Also

- [Text Generation Guide](TEXT_GENERATION.md) - Basic usage examples
- [Advanced Text Parameters](TEXT_ADVANCED.md) - Detailed parameter explanations
- [Function Calling](FUNCTION_CALLING.md) - Tool use and structured outputs
- [JSON Mode](JSON_MODE.md) - Reliable structured data
- [Error Types](ERROR_TYPES.md) - Complete error reference
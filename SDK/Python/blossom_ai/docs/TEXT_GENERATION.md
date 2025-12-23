# 💬 Text Generation Guide

> Complete guide to generating text with Blossom AI

---

## 🚀 Quick Start

### Basic Text Generation

```python
from blossom_ai import ai

# Generate text
response = ai.text.generate("write a short story about a robot")

print(response.text)
print(response.tokens_used)
```

---

## 📋 Parameters

### Basic Parameters

```python
response = ai.text.generate(
    prompt="explain machine learning",
    
    # Model selection
    model="gpt-4",  # or "gpt-3.5-turbo", "claude-3", etc.
    
    # Length control
    max_tokens=1000,
    
    # Temperature (creativity vs predictability)
    temperature=0.7,  # 0.0 = deterministic, 2.0 = very creative
    
    # Alternative to temperature
    top_p=0.9,  # Nucleus sampling
    
    # Penalties
    frequency_penalty=0.0,  # Reduce repetition
    presence_penalty=0.0,   # Encourage new topics
    
    # Stop sequences
    stop=None,  # List of strings to stop generation
    
    # Response format
    response_format="text",  # "text" or "json_object"
)
```

---

## 🎛️ Temperature and Creativity

### Understanding Temperature

```python
# Low temperature = predictable, focused
response = ai.text.generate(
    "write a formal email",
    temperature=0.2
)

# Medium temperature = balanced
response = ai.text.generate(
    "write a creative story",
    temperature=0.7
)

# High temperature = creative, unexpected
response = ai.text.generate(
    "write experimental poetry",
    temperature=1.2
)
```

**Temperature Guidelines:**
- **0.0 - 0.3**: Technical, factual content
- **0.4 - 0.7**: Balanced, general purpose
- **0.8 - 1.0**: Creative writing
- **1.1+**: Experimental, artistic

---

## 💬 Chat Format

### Multi-turn Conversations

```python
from blossom_ai import MessageBuilder

# Build conversation
messages = [
    MessageBuilder.system("You are a helpful assistant."),
    MessageBuilder.user("what is python?"),
    MessageBuilder.assistant("Python is a high-level programming language."),
    MessageBuilder.user("what are its main features?")
]

# Continue conversation
response = ai.text.chat(messages)
print(response.text)

# Add response to conversation
messages.append(MessageBuilder.assistant(response.text))
```

### Simple Chat

```python
# Quick chat without message builder
response = ai.text.chat([
    {"role": "user", "content": "hello, how are you?"}
])
print(response.text)
```

---

## 🔄 Streaming Responses

### Real-time Text Streaming

```python
# Stream text generation
stream = ai.text.generate(
    "write a long essay about artificial intelligence",
    stream=True
)

# Process chunks as they arrive
for chunk in stream:
    if chunk.text:
        print(chunk.text, end="", flush=True)
```

### Streaming Chat

```python
# Stream chat responses
stream = ai.text.chat(
    messages=[{"role": "user", "content": "tell me a story"}],
    stream=True
)

for chunk in stream:
    if chunk.text:
        print(chunk.text, end="", flush=True)
```

---

## 🎯 System Messages

### Setting Behavior

```python
messages = [
    {
        "role": "system",
        "content": "You are a helpful coding assistant. Answer in Python code."
    },
    {
        "role": "user", 
        "content": "write a function to calculate fibonacci"
    }
]

response = ai.text.chat(messages)
print(response.text)  # Will contain Python code
```

### Persona Examples

```python
# Expert persona
expert_messages = [
    MessageBuilder.system("You are an expert in machine learning with 20 years of experience."),
    MessageBuilder.user("explain neural networks")
]

# Creative persona
creative_messages = [
    MessageBuilder.system("You are a creative writer who uses vivid metaphors."),
    MessageBuilder.user("describe a sunset")
]

# Formal persona
formal_messages = [
    MessageBuilder.system("You are a formal business assistant. Use professional language."),
    MessageBuilder.user("write a meeting invitation")
]
```

---

## 📊 Token Management

### Counting Tokens

```python
response = ai.text.generate("write a summary")

print(f"Prompt tokens: {response.prompt_tokens}")
print(f"Completion tokens: {response.completion_tokens}")
print(f"Total tokens: {response.total_tokens}")
```

### Limiting Response Length

```python
# Limit response to 100 tokens
response = ai.text.generate(
    "write a brief summary",
    max_tokens=100
)

# Longer response
response = ai.text.generate(
    "write a detailed explanation",
    max_tokens=2000
)
```

---

## 🎛️ Advanced Parameters

### Frequency and Presence Penalties

```python
# Reduce repetition
response = ai.text.generate(
    "write about dogs",
    frequency_penalty=0.5,  # 0.0 to 2.0
    presence_penalty=0.5    # 0.0 to 2.0
)
```

**Penalty Guidelines:**
- **0.0**: No penalty (default)
- **0.5**: Slight reduction in repetition
- **1.0**: Moderate penalty
- **2.0**: Maximum penalty

### Stop Sequences

```python
# Stop generation at specific strings
response = ai.text.generate(
    "write a list",
    stop=["\n\n", "END", "STOP"]
)
```

---

## 🏗️ Using BlossomClient

### Basic Usage

```python
from blossom_ai import BlossomClient

with BlossomClient() as client:
    response = client.text.generate(
        "explain blockchain technology",
        model="gpt-4",
        max_tokens=500,
        temperature=0.7
    )
    
    print(response.text)
    print(f"Tokens used: {response.total_tokens}")
```

### Chat with Client

```python
with BlossomClient() as client:
    messages = [
        {"role": "user", "content": "what is recursion?"}
    ]
    
    response = client.text.chat(
        messages,
        model="gpt-4",
        temperature=0.5
    )
    
    print(response.text)
```

### Streaming with Client

```python
with BlossomClient() as client:
    stream = client.text.generate(
        "write a poem",
        stream=True
    )
    
    for chunk in stream:
        if chunk.text:
            print(chunk.text, end="", flush=True)
```

---

## 🎓 Examples

### 1. Content Creation

```python
# Blog post
def generate_blog_post(topic):
    prompt = f"Write a 500-word blog post about {topic}. Include introduction, main points, and conclusion."
    
    response = ai.text.generate(
        prompt,
        max_tokens=800,
        temperature=0.7
    )
    
    return response.text

# Generate blog post
post = generate_blog_post("renewable energy")
print(post)
```

### 2. Code Generation

```python
def generate_code(description):
    prompt = f"Write Python code to {description}. Include comments and error handling."
    
    response = ai.text.generate(
        prompt,
        model="gpt-4",
        temperature=0.2,  # Low temperature for accuracy
        max_tokens=1000
    )
    
    return response.text

# Generate code
code = generate_code("read a CSV file")
print(code)
```

### 3. Data Analysis

```python
def analyze_data(data_description):
    prompt = f"Analyze the following data and provide insights: {data_description}"
    
    response = ai.text.generate(
        prompt,
        temperature=0.3,
        max_tokens=600
    )
    
    return response.text

# Analyze data
insights = analyze_data("monthly sales increased by 15% in Q4")
print(insights)
```

### 4. Creative Writing

```python
def write_story(genre, characters):
    prompt = f"Write a short {genre} story featuring {characters}. Be creative and engaging."
    
    response = ai.text.generate(
        prompt,
        temperature=0.9,  # High temperature for creativity
        max_tokens=1200
    )
    
    return response.text

# Write story
story = write_story("sci-fi", "a robot and a human")
print(story)
```

---

## 🔄 Async Usage

### Async Text Generation

```python
import asyncio
from blossom_ai import BlossomClient

async def generate_text_async():
    async with BlossomClient() as client:
        response = await client.text.generate(
            "write async documentation"
        )
        return response.text

# Run async function
text = asyncio.run(generate_text_async())
print(text)
```

### Async Streaming

```python
async def stream_async():
    async with BlossomClient() as client:
        stream = await client.text.generate(
            "write a long story",
            stream=True
        )
        
        async for chunk in stream:
            if chunk.text:
                print(chunk.text, end="", flush=True)

asyncio.run(stream_async())
```

---

## 🛠️ Error Handling

```python
from blossom_ai import BlossomError, RateLimitError, AuthenticationError

try:
    response = ai.text.generate("test")
except RateLimitError:
    print("Rate limit exceeded. Try again later.")
except AuthenticationError:
    print("Invalid API key.")
except BlossomError as e:
    print(f"Error: {e}")
```

---

## 📊 Best Practices

### 1. Choose the Right Model

```python
# Simple tasks
gpt35_response = ai.text.generate(
    "simple task",
    model="gpt-3.5-turbo"
)

# Complex reasoning
gpt4_response = ai.text.generate(
    "complex reasoning",
    model="gpt-4"
)
```

### 2. Optimize Parameters

```python
# Factual content
factual = ai.text.generate(
    "explain physics",
    temperature=0.2,
    max_tokens=300
)

# Creative content
creative = ai.text.generate(
    "write a poem",
    temperature=0.8,
    max_tokens=500
)
```

### 3. Use Streaming for Long Responses

```python
# For long responses, use streaming
stream = ai.text.generate(
    "write a detailed report",
    max_tokens=2000,
    stream=True
)

for chunk in stream:
    process(chunk.text)
```

---

## 🔗 Related Documentation

- [⚙️ Advanced Parameters](TEXT_ADVANCED.md)
- [🛠️ Function Calling](FUNCTION_CALLING.md)
- [📋 JSON Mode](JSON_MODE.md)
- [💬 Text API Reference](API_TEXT.md)

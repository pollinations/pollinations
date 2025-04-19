# LLM Metadata Standards for Pollinations.AI

This document explains the implementation of various LLM metadata standards on Pollinations.AI to improve discoverability and usability for AI agents and tools.

## Implemented Standards

### 1. llms.txt

Located at: [/llms.txt](https://pollinations.ai/llms.txt)

The `llms.txt` file provides guidance for Large Language Models (LLMs) interacting with Pollinations.AI. Similar to robots.txt but specifically for LLMs, it includes:

- Site information and description
- Allowed sections for LLMs to access
- API endpoints documentation
- Usage guidelines and citation preferences
- Data practices and capabilities
- Rate limit information

This helps LLMs better understand the site's content and how to interact with it appropriately.

### 2. agents.json

Located at: [/agents.json](https://pollinations.ai/agents.json)

The `agents.json` file is an OpenAPI-based specification that allows LLMs to discover and invoke our APIs with natural language. It defines:

- Detailed API endpoint documentation
- Request and response formats
- Parameter descriptions and defaults
- Example requests for common use cases
- Authentication information (none required)
- Function calling capabilities and tool use
- Audio generation parameters

This specification makes it easier for AI agents to understand and use our API capabilities programmatically.

### 3. Model Context Protocol (MCP)

Located at: [/mcp.json](https://pollinations.ai/mcp.json)

The MCP file provides structured context about Pollinations.AI for LLMs, including:

- Platform purpose and capabilities
- Available services and models (text, image, and audio)
- Usage guidelines
- Related resources
- Function calling support
- OpenAI-compatible endpoints

This helps LLMs better understand the context of our platform when interacting with it.

### 4. Arazzo Specification

Located at: [/arazzo.json](https://pollinations.ai/arazzo.json)

The Arazzo specification provides a simplified service description format that focuses on:

- Service endpoints and methods
- Parameter details
- Request and response formats
- Example requests
- Model information
- Capabilities including function calling, streaming, and multi-modal support

This format is designed to be easily parsed by LLMs for understanding API capabilities.

## Supported Capabilities

Our metadata standards now document the following capabilities:

### Text Generation

- Various LLM models including OpenAI, Mistral, Claude, Gemini, and more
- Support for Mistral Small 24B, Phi Mini, Qwen Reasoning, and O3 Mini models
- System prompts and message-based conversations
- OpenAI-compatible endpoints for easy integration

### Image Generation

- Text-to-image generation with multiple models
- Width, height, and seed parameters for customization
- Safety filtering and prompt enhancement

### Audio Generation

- Text-to-speech conversion with multiple voice options
- Various output formats including MP3, Opus, AAC, FLAC, PCM, and WAV
- Speed adjustment for speech synthesis

### Advanced Features

- Function calling and tool use for complex tasks
- Response streaming for real-time interactions
- Multi-modal capabilities for image inputs in text generation
- OpenAI-compatible endpoints at `/v1/chat/completions` and `/openai`

## Benefits

Implementing these standards provides several benefits:

1. **Improved Discoverability**: Makes our APIs more easily discoverable by AI agents and tools
2. **Better Integration**: Enables more sophisticated integrations with AI systems
3. **Future-Proofing**: Positions us to be compatible with emerging AI ecosystem standards
4. **Enhanced User Experience**: Makes it easier for developers using LLMs to work with our platform
5. **Simplified Tool Development**: Function calling support enables AI-powered workflows

## Usage Examples

### For AI Agents

AI agents can now more easily:

- Discover our API capabilities including audio generation and function calling
- Understand parameter requirements for all service types
- Generate valid API calls to text, image, and audio endpoints
- Interpret responses correctly and handle tool calls

### For Developers

Developers can point their LLM-powered tools to these metadata files to:

- Automatically generate API client code
- Create documentation
- Build integrations with minimal manual configuration
- Implement function calling and tool use workflows

## Example Function Calling

```json
{
  "messages": [
    {"role": "user", "content": "What's the weather in New York?"}
  ],
  "model": "openai",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the current weather in a given location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "The city and state"
            },
            "unit": {
              "type": "string",
              "enum": ["celsius", "fahrenheit"]
            }
          },
          "required": ["location"]
        }
      }
    }
  ]
}
```

## Example Audio Generation

```json
{
  "model": "openai-audio",
  "input": "Hello world! This is a text-to-speech example using Pollinations.AI.",
  "voice": "alloy",
  "response_format": "mp3"
}
```

## Future Considerations

As these standards evolve, we will continue to update our implementations to ensure compatibility with the broader AI ecosystem. We welcome feedback on these implementations through our [GitHub repository](https://github.com/pollinations/pollinations).

## Last Updated

2025-04-19

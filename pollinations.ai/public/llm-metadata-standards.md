# LLM Metadata Standards for Pollinations.AI

This document explains the implementation of various LLM metadata standards on Pollinations.AI to improve discoverability and usability for AI agents and tools. Last updated: 2025-04-20.

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

**Example Usage:**
```python
# Python example of an LLM agent using llms.txt
import requests

def get_llms_txt(domain):
    url = f"https://{domain}/llms.txt"
    response = requests.get(url)
    if response.status_code == 200:
        return parse_llms_txt(response.text)
    return None

def parse_llms_txt(content):
    # Simple parser for llms.txt
    sections = {}
    current_section = None

    for line in content.split('\n'):
        if line.startswith('#'):
            # New section
            current_section = line.strip('# ')
            sections[current_section] = []
        elif line.strip() and current_section:
            # Add content to current section
            sections[current_section].append(line)

    return sections

# Use the parsed information to understand API endpoints
llms_info = get_llms_txt("pollinations.ai")
api_endpoints = [line for line in llms_info.get("API Endpoints", []) if line.startswith("API-Endpoint:")]
capabilities = [line for line in llms_info.get("Capabilities", []) if line.startswith("Capability:")]

print(f"Available API Endpoints: {api_endpoints}")
print(f"Capabilities: {capabilities}")
```

### 2. agents.json

Located at: [/agents.json](https://pollinations.ai/agents.json)

The `agents.json` file is an OpenAPI-based specification that allows LLMs to discover and invoke our APIs with natural language. It defines:

- Detailed API endpoint documentation
- Request and response formats
- Parameter descriptions and defaults
- Example requests for common use cases
- Authentication information (none required)

This specification makes it easier for AI agents to understand and use our API capabilities programmatically.

**Example Usage:**
```javascript
// JavaScript example of an AI agent using agents.json
async function loadAgentsJson(domain) {
  const response = await fetch(`https://${domain}/agents.json`);
  if (response.ok) {
    return await response.json();
  }
  return null;
}

async function generateImageWithAgent(prompt, options = {}) {
  // Load the agents.json specification
  const agentsSpec = await loadAgentsJson("pollinations.ai");

  // Find the image generation endpoint
  const imageGenPath = agentsSpec.openapi.paths["/prompt/{prompt}"];
  const imageGenParams = imageGenPath.get.parameters;

  // Extract parameter defaults
  const defaultParams = {};
  imageGenParams.forEach(param => {
    if (param.schema.default !== undefined) {
      defaultParams[param.name] = param.schema.default;
    }
  });

  // Combine defaults with user options
  const finalParams = {...defaultParams, ...options};

  // Construct the URL
  const baseUrl = agentsSpec.openapi.servers.find(s => s.description === "Image Generation API").url;
  const queryParams = new URLSearchParams();

  Object.entries(finalParams).forEach(([key, value]) => {
    if (key !== "prompt") { // Don't add prompt to query params
      queryParams.set(key, value);
    }
  });

  const encodedPrompt = encodeURIComponent(prompt);
  const url = `${baseUrl}/prompt/${encodedPrompt}?${queryParams.toString()}`;

  // Make the request
  return url; // Return the URL that can be used to fetch the image
}

// Example usage
generateImageWithAgent("A beautiful sunset over the ocean", {
  width: 1280,
  height: 720,
  model: "sdxl"
}).then(imageUrl => {
  console.log("Generated image URL:", imageUrl);
});
```

### 3. Model Context Protocol (MCP)

Located at: [/mcp.json](https://pollinations.ai/mcp.json)

The MCP file provides structured context about Pollinations.AI for LLMs, including:

- Platform purpose and capabilities
- Available services and models
- Usage guidelines
- Related resources

This helps LLMs better understand the context of our platform when interacting with it.

**Example Usage:**
```python
# Python example of an AI agent using mcp.json
import requests
import json

def get_mcp_info(domain):
    url = f"https://{domain}/mcp.json"
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    return None

def select_appropriate_model(mcp_info, task_type, requirements):
    """Select the best model based on task requirements"""
    if task_type not in mcp_info["models"]:
        return None

    available_models = mcp_info["models"][task_type]

    # Simple model selection based on description matching
    for model in available_models:
        for req in requirements:
            if req.lower() in model["description"].lower():
                return model["id"]

    # Return default model if no match
    return available_models[0]["id"] if available_models else None

# Get MCP information
mcp_info = get_mcp_info("pollinations.ai")

# Use MCP info to select appropriate models
image_model = select_appropriate_model(mcp_info, "image", ["high-quality"])
text_model = select_appropriate_model(mcp_info, "text", ["open-source"])
audio_model = select_appropriate_model(mcp_info, "audio", ["text-to-speech"])

print(f"Selected image model: {image_model}")
print(f"Selected text model: {text_model}")
print(f"Selected audio model: {audio_model}")

# Get service examples from MCP info
for service in mcp_info["services"]:
    print(f"{service['name']} example: {service['example']}")
```

### 4. Arazzo Specification

Located at: [/arazzo.json](https://pollinations.ai/arazzo.json)

The Arazzo specification provides a simplified service description format that focuses on:

- Service endpoints and methods
- Parameter details
- Request and response formats
- Example requests
- Model information

This format is designed to be easily parsed by LLMs for understanding API capabilities.

**Example Usage:**
```javascript
// JavaScript example of an AI agent using arazzo.json
async function loadArazzoSpec(domain) {
  const response = await fetch(`https://${domain}/arazzo.json`);
  if (response.ok) {
    return await response.json();
  }
  return null;
}

async function findServiceByCapability(capability) {
  const arazzo = await loadArazzoSpec("pollinations.ai");

  // Search for services matching the capability
  return arazzo.services.filter(service =>
    service.description.toLowerCase().includes(capability.toLowerCase())
  );
}

async function executeExampleRequest(serviceName) {
  const arazzo = await loadArazzoSpec("pollinations.ai");

  // Find the service
  const service = arazzo.services.find(s => s.name === serviceName);
  if (!service || !service.examples || service.examples.length === 0) {
    return null;
  }

  // Get the first example
  const example = service.examples[0];

  // For GET requests, we can just return the URL
  if (service.method === "GET") {
    return example.request;
  }

  // For POST requests, we need the full request details
  return example.request;
}

// Example usage
findServiceByCapability("audio").then(services => {
  console.log("Services for audio generation:", services.map(s => s.name));

  if (services.length > 0) {
    executeExampleRequest(services[0].name).then(request => {
      console.log("Example request:", request);
    });
  }
});
```

## MCP Server Integration

Pollinations.AI provides a Model Context Protocol (MCP) server that enables AI assistants like Claude to generate images and audio directly. This server acts as a bridge between AI assistants and the Pollinations.AI APIs.

### How to Use the MCP Server

1. Install the MCP server:
```bash
npm install @pollinations/model-context-protocol
```

2. Run the server:
```bash
npx @pollinations/model-context-protocol
```

3. Connect your AI assistant to the MCP server.

The MCP server provides the following functions to AI assistants:

- `generateImageUrl`: Generate an image from a text prompt and return a URL
- `generateImage`: Generate an image from a text prompt and return base64-encoded image data
- `respondAudio`: Generate an audio response to a prompt
- `sayText`: Convert specific text to speech
- `listModels`: List available models for image and text generation

For more details, see the [MCP Server documentation](https://github.com/pollinations/pollinations/tree/main/model-context-protocol).

## Testing the Standards

To test how well an AI agent can use these metadata standards, you can use the following approaches:

### 1. Testing with OpenAI's Function Calling

```javascript
// Example of testing with OpenAI's function calling
const { OpenAI } = require('openai');
const fs = require('fs');
const axios = require('axios');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Load the metadata standards
const llmsTxt = fs.readFileSync('llms.txt', 'utf8');
const agentsJson = JSON.parse(fs.readFileSync('agents.json', 'utf8'));
const mcpJson = JSON.parse(fs.readFileSync('mcp.json', 'utf8'));
const arazzoJson = JSON.parse(fs.readFileSync('arazzo.json', 'utf8'));

async function testWithLLM() {
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "You are an AI agent that needs to use Pollinations.AI APIs. Use the metadata provided to understand how to interact with the service."
      },
      {
        role: "user",
        content: `Here are the metadata standards for Pollinations.AI:

        llms.txt:
        ${llmsTxt}

        agents.json (summary):
        ${JSON.stringify(agentsJson.metadata)}

        mcp.json (summary):
        ${JSON.stringify({
          name: mcpJson.name,
          description: mcpJson.description,
          services: mcpJson.services.map(s => s.name),
          models: Object.keys(mcpJson.models)
        })}

        Based on this information, how would you generate an image of a sunset over the ocean?`
      }
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "generate_image",
          description: "Generate an image using Pollinations.AI API",
          parameters: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The text description of the image to generate"
              },
              model: {
                type: "string",
                description: "The model to use for generation"
              },
              width: {
                type: "integer",
                description: "Width of the generated image"
              },
              height: {
                type: "integer",
                description: "Height of the generated image"
              }
            },
            required: ["prompt"]
          }
        }
      }
    ],
    tool_choice: "auto"
  });

  console.log("LLM Response:", response.choices[0].message);

  // If the LLM chose to use the function
  if (response.choices[0].message.tool_calls) {
    const toolCall = response.choices[0].message.tool_calls[0];
    const functionArgs = JSON.parse(toolCall.function.arguments);

    console.log("Function called with arguments:", functionArgs);

    // Actually make the request to Pollinations.AI
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(functionArgs.prompt)}`;
    const queryParams = new URLSearchParams();

    if (functionArgs.model) queryParams.append('model', functionArgs.model);
    if (functionArgs.width) queryParams.append('width', functionArgs.width);
    if (functionArgs.height) queryParams.append('height', functionArgs.height);

    const fullUrl = `${imageUrl}?${queryParams.toString()}`;
    console.log("Generated image URL:", fullUrl);

    // Download the image
    const response = await axios.get(fullUrl, { responseType: 'stream' });
    response.data.pipe(fs.createWriteStream('generated_image.jpg'));
    console.log("Image saved as generated_image.jpg");
  }
}

testWithLLM();
```

### 2. Testing with Claude

Claude can use the MCP server directly to generate images and audio. Here's an example of how to test this integration:

1. Install Claude Desktop
2. Install and run the MCP server
3. Add the MCP server to Claude Desktop
4. Ask Claude to generate an image or audio

Example prompt for Claude:
```
Using the Pollinations.AI MCP server, please generate an image of a sunset over the ocean. Then, create an audio clip that describes the image.
```

## React Hooks Integration

Pollinations.AI provides React hooks for easy integration into web applications. These hooks make it simple to generate images, text, and audio directly from React components.

### Available Hooks

- `usePollinationsImage`: Generate images from text prompts
- `usePollinationsText`: Generate text from prompts
- `usePollinationsAudio`: Generate audio from text

### Example Usage

```jsx
import React from 'react';
import { usePollinationsImage, usePollinationsText, usePollinationsAudio } from '@pollinations/react';

function PollinationsDemo() {
  const imagePrompt = "A beautiful sunset over the ocean";
  const textPrompt = "Describe a beautiful sunset over the ocean";
  const audioPrompt = "Welcome to Pollinations.AI";

  const imageUrl = usePollinationsImage(imagePrompt, { width: 800, height: 600 });
  const text = usePollinationsText(textPrompt);
  const audioUrl = usePollinationsAudio(audioPrompt, { voice: "nova" });

  return (
    <div>
      <h1>Pollinations.AI Demo</h1>

      <h2>Generated Image</h2>
      {imageUrl ? (
        <img src={imageUrl} alt={imagePrompt} style={{ maxWidth: '100%' }} />
      ) : (
        <p>Loading image...</p>
      )}

      <h2>Generated Text</h2>
      {text ? (
        <p>{text}</p>
      ) : (
        <p>Loading text...</p>
      )}

      <h2>Generated Audio</h2>
      {audioUrl ? (
        <audio controls src={audioUrl} />
      ) : (
        <p>Loading audio...</p>
      )}
    </div>
  );
}

export default PollinationsDemo;
```

For more details, see the [Pollinations React Hooks documentation](https://react-hooks.pollinations.ai/).

## Benefits

Implementing these standards provides several benefits:

1. **Improved Discoverability**: Makes our APIs more easily discoverable by AI agents and tools
2. **Better Integration**: Enables more sophisticated integrations with AI systems
3. **Future-Proofing**: Positions us to be compatible with emerging AI ecosystem standards
4. **Enhanced User Experience**: Makes it easier for developers using LLMs to work with our platform

## Future Considerations

As these standards evolve, we will continue to update our implementations to ensure compatibility with the broader AI ecosystem. We welcome feedback on these implementations through our [GitHub repository](https://github.com/pollinations/pollinations).

Some future enhancements we're considering:

1. **JSON-LD with Schema.org markup**: Adding structured data to our web pages for better semantic understanding
2. **AI-specific sitemap**: Creating a dedicated sitemap optimized for AI crawlers
3. **Enhanced MCP server capabilities**: Adding more functions and models to our MCP server
4. **AI-friendly headers**: Implementing specific HTTP headers to guide AI crawlers

If you have suggestions for additional metadata standards or improvements to our current implementations, please join our [Discord community](https://discord.gg/k9F7SyTgqn) or create an issue on our [GitHub repository](https://github.com/pollinations/pollinations/issues).

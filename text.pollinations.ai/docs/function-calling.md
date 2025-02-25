# Function Calling with OpenAI Compatible Models

This document explains how to use function calling with OpenAI compatible models in the text.pollinations.ai project.

## Overview

Function calling allows models to call functions that you define, enabling them to:

1. Fetch data (e.g., current weather, search results)
2. Take actions (e.g., sending emails, making API calls)

The implementation in this project is designed to be a simple pass-through for function calling parameters. The client passes the function definitions to the API and returns the response, but does not execute the functions itself (except for the search functionality which is handled separately).

## Basic Usage

### 1. Define Function Definitions (Tools)

First, define the functions that the model can call:

```javascript
const weatherTools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the current weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The location to get weather for"
          }
        },
        required: ["location"]
      }
    }
  }
];
```

### 2. Pass Function Definitions to the Client

When calling the client, include the function definitions in the options:

```javascript
const messages = [
  { role: 'user', content: 'What\'s the weather like in Paris?' }
];

const options = {
  tools: weatherTools,
  tool_choice: 'auto'  // Let the model decide when to call the function
};

const response = await client(messages, options);
```

### 3. Handle Function Calls in the Response

Check if the model called a function and handle it:

```javascript
if (response.choices[0].message.tool_calls) {
  const toolCalls = response.choices[0].message.tool_calls;
  
  for (const toolCall of toolCalls) {
    if (toolCall.function.name === 'get_weather') {
      const args = JSON.parse(toolCall.function.arguments);
      const weatherData = await getWeatherData(args.location);
      
      // Add the function result to messages
      messages.push(response.choices[0].message);
      messages.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolCall.function.name,
        content: weatherData
      });
      
      // Make another request with the function result
      const finalResponse = await client(messages, options);
      return finalResponse;
    }
  }
}
```

## Example Implementation

See `generateTextOpenRouter.js` for an example implementation of function calling with the generic OpenAI client:

```javascript
// Function definitions (tools)
export const OPENROUTER_TOOLS = {
  weather: [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get the current weather for a location",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The location to get weather for"
            }
          },
          required: ["location"]
        }
      }
    }
  ]
};

// Example function to use function calling
export async function generateTextWithFunctions(messages, toolType = 'weather') {
  const tools = OPENROUTER_TOOLS[toolType] || [];
  
  const response = await generateTextOpenRouter(messages, {
    tools,
    tool_choice: 'auto'
  });
  
  return response;
}
```

## Testing

See `test/functionCalling.test.js` and `test/openRouterFunctions.test.js` for examples of how to test function calling.

## Function Calling Parameters

### tools

An array of tool objects that the model may generate tool calls for. Each tool object has the following structure:

```javascript
{
  type: "function",
  function: {
    name: "function_name",
    description: "Description of what the function does",
    parameters: {
      type: "object",
      properties: {
        // Function parameters
      },
      required: ["param1", "param2"]
    }
  }
}
```

### tool_choice

Controls which (if any) function is called by the model. Can be:

- `"auto"`: The model decides whether to call a function and which one to call
- `"none"`: The model will not call a function
- `{ type: "function", function: { name: "function_name" } }`: Force the model to call the specified function

## Response Format

When the model calls a function, the response will include a `tool_calls` array in the message:

```javascript
{
  choices: [
    {
      message: {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_abc123",
            type: "function",
            function: {
              name: "get_weather",
              arguments: "{\"location\":\"Paris\"}"
            }
          }
        ]
      }
    }
  ]
}
```

## Handling Function Results

To provide the function result back to the model:

1. Add the model's message with the function call to your messages array
2. Add a new message with the function result:

```javascript
{
  tool_call_id: "call_abc123",
  role: "tool",
  name: "get_weather",
  content: "The weather in Paris is sunny with a temperature of 25°C"
}
```

3. Make another request with the updated messages array

## Notes

- Not all models support function calling. Check the model's documentation to see if it supports this feature.
- The client does not execute functions automatically. You need to handle function execution and provide the results back to the model.
- The search functionality in `generateTextOpenai.js` is an example of how to handle function calls and provide results back to the model.
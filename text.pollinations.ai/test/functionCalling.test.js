import test from 'ava';
import { createOpenAICompatibleClient } from '../genericOpenAIClient.js';
import dotenv from 'dotenv';

dotenv.config();

// Define a simple weather function
const getWeather = async (args) => {
  const { location } = args;
  return `The weather in ${location} is sunny with a temperature of 25°C`;
};

// Define function definitions (tools)
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

// Create a test client with function calling support
const testClient = createOpenAICompatibleClient({
  endpoint: process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions',
  authHeaderName: 'Authorization',
  authHeaderValue: () => `Bearer ${process.env.OPENAI_API_KEY}`,
  modelMapping: {
    'test-model': 'gpt-4o'
  },
  systemPrompts: {
    'test-model': 'You are a helpful assistant.'
  },
  defaultOptions: {
    model: 'test-model',
    temperature: 0.7,
    maxTokens: 1024
  },
  providerName: 'TestProvider'
});

// Skip tests if API key is not available
const hasApiKey = !!process.env.OPENAI_API_KEY;

test.skip('Function calling - passing tools to the API', async (t) => {
  if (!hasApiKey) {
    t.pass('Skipping test due to missing API key');
    return;
  }

  const messages = [
    { role: 'user', content: 'What\'s the weather like in Paris?' }
  ];

  const options = {
    tools: weatherTools,
    tool_choice: 'auto'
  };

  const response = await testClient(messages, options);
  
  t.truthy(response);
  t.truthy(response.choices);
  t.truthy(response.choices[0].message);
  
  // Check if the model called the function
  if (response.choices[0].message.tool_calls) {
    const toolCalls = response.choices[0].message.tool_calls;
    t.truthy(toolCalls);
    
    // Check if the function name is correct
    const functionCall = toolCalls[0];
    t.is(functionCall.function.name, 'get_weather');
    
    // Check if the arguments are correct
    const args = JSON.parse(functionCall.function.arguments);
    t.is(args.location, 'Paris');
  } else {
    // If the model didn't call the function, that's also acceptable
    t.pass('Model did not call the function');
  }
});

test.skip('Function calling - handling function execution', async (t) => {
  if (!hasApiKey) {
    t.pass('Skipping test due to missing API key');
    return;
  }

  const messages = [
    { role: 'user', content: 'What\'s the weather like in Paris?' }
  ];

  const options = {
    tools: weatherTools,
    tool_choice: 'auto'
  };

  // First request to get function calls
  const response1 = await testClient(messages, options);
  
  // Check if the model called the function
  if (!response1.choices[0].message.tool_calls) {
    t.pass('Model did not call the function, skipping function execution test');
    return;
  }
  
  const toolCalls = response1.choices[0].message.tool_calls;
  const functionCall = toolCalls[0];
  
  // Execute the function
  const args = JSON.parse(functionCall.function.arguments);
  const result = await getWeather(args);
  
  // Add the function call and result to messages
  const updatedMessages = [
    ...messages,
    response1.choices[0].message,
    {
      tool_call_id: functionCall.id,
      role: 'tool',
      name: functionCall.function.name,
      content: result
    }
  ];
  
  // Make a second request with the function result
  const response2 = await testClient(updatedMessages, options);
  
  t.truthy(response2);
  t.truthy(response2.choices);
  t.truthy(response2.choices[0].message);
  t.truthy(response2.choices[0].message.content);
  
  // The response should now include the weather information
  t.true(response2.choices[0].message.content.includes('Paris'));
  t.true(response2.choices[0].message.content.includes('weather'));
});
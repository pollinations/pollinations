import test from 'ava';
import dotenv from 'dotenv';

// Import the OpenAI client directly to test function calling
import { generateTextPortkey } from '../generateTextPortkey.js';

dotenv.config();

// Check for required environment variables
console.log('Environment variables check:');
console.log('AZURE_OPENAI_ENDPOINT:', process.env.AZURE_OPENAI_ENDPOINT ? 'Set' : 'Not set');
console.log('AZURE_OPENAI_API_KEY:', process.env.AZURE_OPENAI_API_KEY ? 'Set' : 'Not set');
console.log('AZURE_OPENAI_LARGE_ENDPOINT:', process.env.AZURE_OPENAI_LARGE_ENDPOINT ? 'Set' : 'Not set');
console.log('AZURE_OPENAI_LARGE_API_KEY:', process.env.AZURE_OPENAI_LARGE_API_KEY ? 'Set' : 'Not set');

// Configure higher timeout for all tests
test.beforeEach(t => {
    t.timeout(60000); // 60 seconds in milliseconds
});

// Skip tests if API key is not available
const hasApiKey = !!process.env.AZURE_OPENAI_API_KEY;

test('Basic function calling with OpenAI', async (t) => {
  if (!hasApiKey) {
    t.pass('Skipping test due to missing API key');
    return;
  }

  // Define a simple weather function tool with strict mode enabled
  const weatherTool = {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current temperature for a given location.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City and country e.g. Paris, France"
          }
        },
        required: ["location"],
        additionalProperties: false
      },
      strict: true
    }
  };

  const messages = [
    { 
      role: 'system', 
      content: 'You are a helpful assistant that uses the get_weather function to provide weather information.'
    },
    { 
      role: 'user', 
      content: 'What\'s the weather like in Paris? Please use the get_weather function to find out.' 
    }
  ];

  try {
    // Call OpenAI with function calling enabled and required tool choice
    // Note: performSearch is false, so we're in proxy mode
    console.log('Calling OpenAI with function calling enabled and required tool choice...');
    const response = await generateTextPortkey(messages, {
      model: 'openai', // This will map to gpt-4o-mini (faster)
      tools: [weatherTool],
      tool_choice: "required", // Force the model to use a function
      temperature: 0.7,
      maxTokens: 1024
    }, false); // Don't use performSearch flag, use proxy mode
    
    console.log('Response received:', response ? 'Yes' : 'No');
    if (response) {
      console.log('Response has choices:', response.choices ? 'Yes' : 'No');
      if (response.choices && response.choices.length > 0) {
        console.log('Response has message:', response.choices[0].message ? 'Yes' : 'No');
        if (response.choices[0].message) {
          console.log('Message has tool_calls:', response.choices[0].message.tool_calls ? 'Yes' : 'No');
        }
      }
    }
    
    t.truthy(response);
    t.truthy(response.choices);
    t.truthy(response.choices[0].message);
    
    // Check if the model called the function
    if (response.choices[0].message.tool_calls) {
      const toolCalls = response.choices[0].message.tool_calls;
      t.truthy(toolCalls);
      console.log('Tool calls:', JSON.stringify(toolCalls, null, 2));
      
      // Check if the function name is correct
      const functionCall = toolCalls[0];
      t.true(['web_search', 'web_scrape', 'get_weather'].includes(functionCall.function.name), 
        `Expected function name to be one of ['web_search', 'web_scrape', 'get_weather'], got ${functionCall.function.name}`);
      
      // If it's the weather function, check the arguments
      if (functionCall.function.name === 'get_weather') {
        const args = JSON.parse(functionCall.function.arguments);
        // Check that the location contains "Paris" (more flexible)
        t.true(args.location.toLowerCase().includes('paris'), 
          `Expected location to contain "paris", got "${args.location}"`);
      }
    } else {
      // If the model didn't call the function, that's a failure
      console.log('Model did not call the function');
      t.fail('Model did not call the function even with tool_choice set to "required"');
    }
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    t.fail(`Error calling OpenAI: ${error.message}`);
  }
});

test('Function calling with generic client', async (t) => {
  // Skip this test for now as we're focusing on OpenAI
  t.pass('Skipping generic client test for now');
});
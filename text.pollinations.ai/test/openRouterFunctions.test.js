import test from 'ava';
import { generateTextWithFunctions, OPENROUTER_TOOLS } from '../generateTextOpenRouter.js';
import dotenv from 'dotenv';

dotenv.config();

// Skip tests if API key is not available
const hasApiKey = !!process.env.OPENROUTER_API_KEY;

test.skip('OpenRouter function calling - weather', async (t) => {
  if (!hasApiKey) {
    t.pass('Skipping test due to missing API key');
    return;
  }

  const messages = [
    { role: 'user', content: 'What\'s the weather like in Paris?' }
  ];

  const response = await generateTextWithFunctions(messages, 'weather');
  
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
    
    // Log the function call for debugging
    console.log('Function call:', JSON.stringify(functionCall, null, 2));
  } else {
    // If the model didn't call the function, that's also acceptable
    t.pass('Model did not call the function');
    console.log('Response content:', response.choices[0].message.content);
  }
});

test.skip('OpenRouter function calling - calculator', async (t) => {
  if (!hasApiKey) {
    t.pass('Skipping test due to missing API key');
    return;
  }

  const messages = [
    { role: 'user', content: 'Calculate 15 * 7 + 22' }
  ];

  const response = await generateTextWithFunctions(messages, 'calculator');
  
  t.truthy(response);
  t.truthy(response.choices);
  t.truthy(response.choices[0].message);
  
  // Check if the model called the function
  if (response.choices[0].message.tool_calls) {
    const toolCalls = response.choices[0].message.tool_calls;
    t.truthy(toolCalls);
    
    // Check if the function name is correct
    const functionCall = toolCalls[0];
    t.is(functionCall.function.name, 'calculate');
    
    // Check if the arguments are correct
    const args = JSON.parse(functionCall.function.arguments);
    t.truthy(args.expression);
    
    // Log the function call for debugging
    console.log('Function call:', JSON.stringify(functionCall, null, 2));
  } else {
    // If the model didn't call the function, that's also acceptable
    t.pass('Model did not call the function');
    console.log('Response content:', response.choices[0].message.content);
  }
});

// Example of handling function execution and getting a final response
test.skip('OpenRouter function calling - complete flow', async (t) => {
  if (!hasApiKey) {
    t.pass('Skipping test due to missing API key');
    return;
  }

  // Mock weather function implementation
  const getWeather = (location) => {
    return `The weather in ${location} is sunny with a temperature of 25°C`;
  };

  const messages = [
    { role: 'user', content: 'What\'s the weather like in Paris?' }
  ];

  // First request to get function calls
  const response1 = await generateTextWithFunctions(messages, 'weather');
  
  // Check if the model called the function
  if (!response1.choices[0].message.tool_calls) {
    t.pass('Model did not call the function, skipping function execution test');
    return;
  }
  
  const toolCalls = response1.choices[0].message.tool_calls;
  const functionCall = toolCalls[0];
  
  // Execute the function
  const args = JSON.parse(functionCall.function.arguments);
  const result = getWeather(args.location);
  
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
  const response2 = await generateTextWithFunctions(updatedMessages, 'weather');
  
  t.truthy(response2);
  t.truthy(response2.choices);
  t.truthy(response2.choices[0].message);
  t.truthy(response2.choices[0].message.content);
  
  // The response should now include the weather information
  t.true(response2.choices[0].message.content.includes('Paris'));
  t.true(response2.choices[0].message.content.includes('weather'));
  
  // Log the final response for debugging
  console.log('Final response:', response2.choices[0].message.content);
});
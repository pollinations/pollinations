import dotenv from 'dotenv';
import { findModelByName } from './availableModels.js';
import { generateTextPortkey } from './generateTextPortkey.js';

dotenv.config();

// A simple test function to verify the o3 model configuration
async function testOpenAIReasoningModel() {
  console.log('Testing the openai-reasoning model configuration');
  
  // Find the model details
  const model = findModelByName('openai-reasoning');
  console.log('Model details:', JSON.stringify(model, null, 2));
  
  // Show model mapping
  console.log('Model mapping:', model.handler.modelMapping ? 
    model.handler.modelMapping['openai-reasoning'] : 'Mapping not found');
    
  // Simple test request
  try {
    const response = await generateTextPortkey([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello, please identify which model you are using' }
    ], { model: 'openai-reasoning', stream: false });
    
    console.log('Response from model:', response);
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
testOpenAIReasoningModel().catch(console.error);

/**
 * Pollinations Text Service
 * 
 * Functions for interacting with the Pollinations Text API
 */

/**
 * Generates text from a prompt using the Pollinations Text API
 * 
 * @param {string} prompt - The text prompt to generate a response for
 * @param {string} [model="openai"] - Model to use for text generation
 * @param {number} [seed] - Seed for reproducible results
 * @param {string} [systemPrompt] - Optional system prompt to set the behavior of the AI
 * @param {boolean} [json] - Set to true to receive response in JSON format
 * @param {boolean} [private] - Set to true to prevent the response from appearing in the public feed
 * @returns {Promise<string>} - The generated text response
 */
export async function generateText(prompt, model = "openai", seed, systemPrompt, json, isPrivate) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required and must be a string');
  }
  
  // Build the query parameters
  const queryParams = new URLSearchParams();
  if (model) queryParams.append('model', model);
  if (seed !== undefined) queryParams.append('seed', seed);
  if (systemPrompt) queryParams.append('system', encodeURIComponent(systemPrompt));
  if (json) queryParams.append('json', 'true');
  if (isPrivate) queryParams.append('private', 'true');
  
  // Construct the URL
  const encodedPrompt = encodeURIComponent(prompt);
  const baseUrl = 'https://text.pollinations.ai';
  let url = `${baseUrl}/${encodedPrompt}`;
  
  // Add query parameters if they exist
  const queryString = queryParams.toString();
  if (queryString) {
    url += `?${queryString}`;
  }
  
  try {
    // Fetch the text from the URL
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to generate text: ${response.statusText}`);
    }
    
    // Get the text response
    const textResponse = await response.text();
    
    return textResponse;
  } catch (error) {
    console.error('Error generating text:', error);
    throw error;
  }
}

/**
 * List available text generation models from Pollinations API
 * 
 * @returns {Promise<Object>} - Object containing the list of available text models
 */
export async function listTextModels() {
  try {
    const response = await fetch('https://text.pollinations.ai/models');
    
    if (!response.ok) {
      throw new Error(`Failed to list text models: ${response.statusText}`);
    }
    
    const models = await response.json();
    return { models };
  } catch (error) {
    console.error('Error listing text models:', error);
    throw error;
  }
}

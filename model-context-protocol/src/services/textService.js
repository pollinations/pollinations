/**
 * Pollinations Text Service
 * 
 * Functions for interacting with the Pollinations Text API
 */

/**
 * Generates text from a prompt using the Pollinations Text API
 * 
 * @param {Object} params - The parameters for text generation
 * @param {string} params.prompt - The text prompt to generate a response for
 * @param {string} [params.model="openai"] - Model to use for text generation
 * @param {Object} [params.options={}] - Additional options for text generation
 * @param {number} [params.options.seed] - Seed for reproducible results
 * @param {string} [params.options.systemPrompt] - Optional system prompt to set the behavior of the AI
 * @param {boolean} [params.options.json] - Set to true to receive response in JSON format
 * @param {boolean} [params.options.isPrivate] - Set to true to prevent the response from appearing in the public feed
 * @returns {Promise<Object>} - MCP response object with the generated text
 */
export async function generateText(params) {
  const { prompt, model = "openai", options = {} } = params;
  
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required and must be a string');
  }
  
  const { seed, systemPrompt, json, isPrivate } = options;
  
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
    
    // Return the response in MCP format
    return {
      content: [
        { type: 'text', text: textResponse }
      ]
    };
  } catch (error) {
    console.error('Error generating text:', error);
    throw error;
  }
}

/**
 * List available text generation models from Pollinations API
 * 
 * @param {Object} params - The parameters for listing text models
 * @returns {Promise<Object>} - MCP response object with the list of available text models
 */
export async function listTextModels(params) {
  try {
    const response = await fetch('https://text.pollinations.ai/models');
    
    if (!response.ok) {
      throw new Error(`Failed to list text models: ${response.statusText}`);
    }
    
    const models = await response.json();
    
    // Return the response in MCP format
    return {
      content: [
        { type: 'text', text: JSON.stringify({ models }, null, 2) }
      ]
    };
  } catch (error) {
    console.error('Error listing text models:', error);
    throw error;
  }
}

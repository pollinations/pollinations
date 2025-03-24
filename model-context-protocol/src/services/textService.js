/**
 * Pollinations Text Service
 * 
 * Functions for interacting with the Pollinations Text API
 */

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
    
    return await response.json();
  } catch (error) {
    console.error('Error listing text models:', error);
    throw error;
  }
}

/**
 * Pollinations API Client
 * 
 * A simple client for the Pollinations APIs that follows the thin proxy design principle
 */

// Import services
import { generateImageUrl, generateImage, listImageModels } from './services/imageService.js';
import { respondAudio, sayText, listAudioVoices } from './services/audioService.js';
import { generateText, listTextModels } from './services/textService.js';
import { listResources, listPrompts } from './services/resourceService.js';

/**
 * List available models from Pollinations APIs
 * 
 * @param {string} [type="image"] - The type of models to list ("image" or "text")
 * @returns {Promise<Object>} - Object containing the list of available models
 */
export async function listModels(type = "image") {
  if (type === "image") {
    return await listImageModels();
  } else if (type === "text") {
    return await listTextModels();
  } else {
    throw new Error('Invalid model type. Must be "image" or "text"');
  }
}

// Export all service functions
export {
  // Image services
  generateImageUrl,
  generateImage,
  listImageModels,
  
  // Audio services
  respondAudio,
  sayText,
  listAudioVoices,
  
  // Text services
  generateText,
  listTextModels,
  
  // Resource services
  listResources,
  listPrompts
};

// If this file is run directly (e.g., with Node.js)
if (typeof require !== 'undefined' && require.main === module) {
  async function run() {
    try {
      console.log('Testing Pollinations API client...');
      
      // Test image URL generation
      const imageUrl = await generateImageUrl('A beautiful sunset over the ocean');
      console.log('Image URL:', imageUrl);
      
      // Test model listing
      const imageModels = await listImageModels();
      console.log('Image models:', imageModels);
      
      const textModels = await listTextModels();
      console.log('Text models:', textModels);
      
      const voices = await listAudioVoices();
      console.log('Audio voices:', voices);
      
      // Test resource listing
      const resources = await listResources();
      console.log('Resources:', resources);
      
      const prompts = await listPrompts();
      console.log('Prompts:', prompts);
      
    } catch (error) {
      console.error('Error:', error);
    }
  }
  
  run();
}

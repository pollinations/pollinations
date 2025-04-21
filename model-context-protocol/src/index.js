/**
 * Pollinations API Client
 * 
 * A simple client for the Pollinations APIs that follows the thin proxy design principle
 */

// Import services
import { generateImageUrl, generateImage, listImageModels } from './services/imageService.js';
import { respondAudio, sayText, listAudioVoices, playAudio } from './services/audioService.js';
import { generateText, listTextModels } from './services/textService.js';
import { listResources, listPrompts } from './services/resourceService.js';
import { 
  isAuthenticated,
  getAuthUrl,
  getToken,
  regenerateToken,
  listReferrers,
  addReferrer,
  removeReferrer,
  verifyToken,
  verifyReferrer,
  completeAuth
} from './services/authService.js';

// Import schemas
import {
  // Image schemas
  generateImageUrlSchema,
  generateImageSchema,
  listImageModelsSchema,
  
  // Audio schemas
  respondAudioSchema,
  sayTextSchema,
  listAudioVoicesSchema,
  
  // Text schemas
  generateTextSchema,
  listTextModelsSchema,
  
  // Resource schemas
  listResourcesSchema,
  listPromptsSchema,
  
  // Auth schemas
  isAuthenticatedSchema,
  getAuthUrlSchema,
  getTokenSchema,
  verifyTokenSchema,
  listReferrersSchema,
  addReferrerSchema,
  removeReferrerSchema
} from './schemas.js';

/**
 * List available models from Pollinations APIs
 * 
 * @param {Object} params - The parameters for listing models
 * @param {string} [params.type="image"] - The type of models to list ("image" or "text")
 * @returns {Promise<Object>} - Object containing the list of available models
 */
export async function listModels(params) {
  const { type = "image" } = params || {};
  
  if (type === "image") {
    return await listImageModels(params);
  } else if (type === "text") {
    return await listTextModels(params);
  } else {
    throw new Error('Invalid model type. Must be "image" or "text"');
  }
}

// Define listModels schema
const listModelsSchema = {
  name: 'listModels',
  description: 'List available models from Pollinations APIs',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Filter models by type (image, text, audio)'
      }
    },
    required: []
  }
};

// Export tool definitions (schemas and handlers)
export const toolDefinitions = {
  // Image tools
  generateImageUrl: { schema: generateImageUrlSchema, handler: generateImageUrl },
  generateImage: { schema: generateImageSchema, handler: generateImage },
  listImageModels: { schema: listImageModelsSchema, handler: listImageModels },
  
  // Audio tools
  respondAudio: { schema: respondAudioSchema, handler: respondAudio },
  sayText: { schema: sayTextSchema, handler: sayText },
  listAudioVoices: { schema: listAudioVoicesSchema, handler: listAudioVoices },
  
  // Text tools
  generateText: { schema: generateTextSchema, handler: generateText },
  listTextModels: { schema: listTextModelsSchema, handler: listTextModels },
  
  // Resource tools
  listResources: { schema: listResourcesSchema, handler: listResources },
  listPrompts: { schema: listPromptsSchema, handler: listPrompts },
  
  // Auth tools
  isAuthenticated: { schema: isAuthenticatedSchema, handler: isAuthenticated },
  getAuthUrl: { schema: getAuthUrlSchema, handler: getAuthUrl },
  getToken: { schema: getTokenSchema, handler: getToken },
  verifyToken: { schema: verifyTokenSchema, handler: verifyToken },
  listReferrers: { schema: listReferrersSchema, handler: listReferrers },
  addReferrer: { schema: addReferrerSchema, handler: addReferrer },
  removeReferrer: { schema: removeReferrerSchema, handler: removeReferrer },
  
  // Utility tools
  listModels: { schema: listModelsSchema, handler: listModels }
};

// Export all service functions individually for backward compatibility
export {
  // Image services
  generateImageUrl,
  generateImage,
  listImageModels,
  
  // Audio services
  respondAudio,
  sayText,
  playAudio,
  listAudioVoices,
  
  // Text services
  generateText,
  listTextModels,
  
  // Resource services
  listResources,
  listPrompts,
  
  // Authentication services
  isAuthenticated,
  getAuthUrl,
  getToken,
  regenerateToken,
  listReferrers,
  addReferrer,
  removeReferrer,
  verifyToken,
  verifyReferrer,
  completeAuth
};

// If this file is run directly (e.g., with Node.js)
if (typeof require !== 'undefined' && require.main === module) {
  async function run() {
    try {
      console.log('Testing Pollinations API client...');
      
      // Test image URL generation
      const imageUrl = await generateImageUrl({ prompt: 'A beautiful sunset over the ocean' });
      console.log('Image URL:', imageUrl);
      
      // Test model listing
      const imageModels = await listImageModels({});
      console.log('Image models:', imageModels);
      
      const textModels = await listTextModels({});
      console.log('Text models:', textModels);
      
      const voices = await listAudioVoices({});
      console.log('Audio voices:', voices);
      
      // Test resource listing
      const resources = await listResources({});
      console.log('Resources:', resources);
      
      const prompts = await listPrompts({});
      console.log('Prompts:', prompts);
      
    } catch (error) {
      console.error('Error:', error);
    }
  }
  
  run();
}

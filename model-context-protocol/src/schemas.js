/**
 * Central export for all schema definitions
 */

import { generateImageUrlSchema, generateImageSchema, listImageModelsSchema } from './services/imageSchema.js';
import { respondAudioSchema, sayTextSchema, listAudioVoicesSchema } from './services/audioSchema.js';
import { generateTextSchema, listTextModelsSchema } from './services/textSchema.js';
import { listResourcesSchema, listPromptsSchema } from './services/resourceSchema.js';

// Re-export all schemas
export {
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
  listPromptsSchema
};

/**
 * Get all tool schemas as an array
 * @returns {Array} Array of all tool schemas
 */
export function getAllToolSchemas() {
  return [
    generateImageUrlSchema,
    generateImageSchema,
    listImageModelsSchema,
    respondAudioSchema,
    sayTextSchema,
    listAudioVoicesSchema,
    generateTextSchema,
    listTextModelsSchema,
    listResourcesSchema,
    listPromptsSchema
  ];
}

/**
 * Central export for all schema definitions
 */

import { generateImageUrlSchema, generateImageSchema, listImageModelsSchema } from './services/imageSchema.js';
import { respondAudioSchema, sayTextSchema, listAudioVoicesSchema } from './services/audioSchema.js';
import { generateTextSchema, listTextModelsSchema } from './services/textSchema.js';
import { listResourcesSchema, listPromptsSchema } from './services/resourceSchema.js';
import { 
  isAuthenticatedSchema, 
  getAuthUrlSchema, 
  getTokenSchema, 
  verifyTokenSchema,
  listReferrersSchema, 
  addReferrerSchema, 
  removeReferrerSchema 
} from './services/authSchema.js';

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
  listPromptsSchema,
  
  // Auth schemas
  isAuthenticatedSchema,
  getAuthUrlSchema,
  getTokenSchema,
  verifyTokenSchema,
  listReferrersSchema,
  addReferrerSchema,
  removeReferrerSchema
};

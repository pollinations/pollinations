/**
 * Pollinations API Client
 *
 * A simple client for the Pollinations APIs that follows the thin proxy design principle
 */

// Import tools with their schemas and handlers
import { imageTools, generateImageUrl, generateImage, listImageModels } from './services/imageService.js';
import { textTools, generateText, listTextModels } from './services/textService.js';
import { audioTools, respondAudio, sayText, listAudioVoices, playAudio } from './services/audioService.js';
import { resourceTools, listResources, listPrompts } from './services/resourceService.js';

// Each model type has its own listing function with specific behavior
// We don't need a generic wrapper function that just delegates

// All services now follow the pattern where schemas are defined
// directly in the service file and exported as part of a tools object

// Export tool definitions
export const toolDefinitions = {
  // Image tools
  ...imageTools,

  // Text tools
  ...textTools,

  // Audio tools
  ...audioTools,

  // Resource tools
  ...resourceTools
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
  listPrompts
};

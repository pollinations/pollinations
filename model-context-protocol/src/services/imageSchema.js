import { createSchema } from './schemaHelper.js';

const imageOptions = {
  model: {
    type: 'string',
    description: 'Model name to use for generation'
  },
  seed: {
    type: 'number',
    description: 'Seed for reproducible results'
  },
  width: {
    type: 'number',
    description: 'Width of the generated image'
  },
  height: {
    type: 'number',
    description: 'Height of the generated image'
  }
};

export const generateImageUrlSchema = createSchema(
  'generateImageUrl',
  'Generate an image URL from a text prompt',
  {
    prompt: {
      type: 'string',
      description: 'The text description of the image to generate'
    },
    options: {
      type: 'object',
      description: 'Additional options for image generation',
      properties: imageOptions
    }
  },
  ['prompt']
);

export const generateImageSchema = createSchema(
  'generateImage',
  'Generate an image and return the base64-encoded data',
  {
    prompt: {
      type: 'string',
      description: 'The text description of the image to generate'
    },
    options: {
      type: 'object',
      description: 'Additional options for image generation',
      properties: imageOptions
    }
  },
  ['prompt']
);

/**
 * Schema for the listImageModels tool
 */
export const listImageModelsSchema = {
  name: 'listImageModels',
  description: 'List available image models',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

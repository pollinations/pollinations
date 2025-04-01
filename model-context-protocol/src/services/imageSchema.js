/**
 * Schema definitions for the Pollinations Image API
 */

/**
 * Schema for the generateImageUrl tool
 */
export const generateImageUrlSchema = {
  name: 'generateImageUrl',
  description: 'Generate an image URL from a text prompt',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The text description of the image to generate'
      },
      options: {
        type: 'object',
        description: 'Additional options for image generation',
        properties: {
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
        },
      }
    },
    required: ['prompt']
  }
};

/**
 * Schema for the generateImage tool
 */
export const generateImageSchema = {
  name: 'generateImage',
  description: 'Generate an image and return the base64-encoded data',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The text description of the image to generate'
      },
      options: {
        type: 'object',
        description: 'Additional options for image generation',
        properties: {
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
        },
      }
    },
    required: ['prompt']
  }
};

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

/**
 * Schema definitions for the Pollinations Text API
 */

/**
 * Schema for the generateText tool
 */
export const generateTextSchema = {
  name: 'generateText',
  description: 'Generate text from a prompt using the Pollinations Text API',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The text prompt to generate a response for'
      },
      model: {
        type: 'string',
        description: 'Model to use for text generation (default: "openai")'
      },
      seed: {
        type: 'number',
        description: 'Seed for reproducible results'
      },
      systemPrompt: {
        type: 'string',
        description: 'Optional system prompt to set the behavior of the AI'
      },
      json: {
        type: 'boolean',
        description: 'Set to true to receive response in JSON format'
      },
      private: {
        type: 'boolean',
        description: 'Set to true to prevent the response from appearing in the public feed'
      }
    },
    required: ['prompt']
  }
};

/**
 * Schema for the listTextModels tool
 */
export const listTextModelsSchema = {
  name: 'listTextModels',
  description: 'List available text models',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

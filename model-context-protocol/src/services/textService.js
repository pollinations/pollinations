/**
 * Pollinations Text Service
 *
 * Functions and schemas for interacting with the Pollinations Text API
 */

import { createMCPResponse, createTextContent, buildUrl, createToolDefinition } from '../utils.js';

// Constants
const TEXT_API_BASE_URL = 'https://text.pollinations.ai';

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
      options: {
        type: 'object',
        description: 'Additional options for text generation',
        properties: {
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
          isPrivate: {
            type: 'boolean',
            description: 'Set to true to prevent the response from appearing in the public feed'
          }
        }
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

  // Prepare query parameters
  const queryParams = {
    model,
    seed,
    ...(systemPrompt && { system: encodeURIComponent(systemPrompt) }),
    ...(json && { json: 'true' }),
    ...(isPrivate && { private: 'true' })
  };

  // Construct the URL
  const encodedPrompt = encodeURIComponent(prompt);
  const url = buildUrl(TEXT_API_BASE_URL, encodedPrompt, queryParams);

  try {
    // Fetch the text from the URL
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to generate text: ${response.statusText}`);
    }

    // Get the text response
    const textResponse = await response.text();

    // Return the response in MCP format
    return createMCPResponse([
      createTextContent(textResponse)
    ]);
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
    const url = buildUrl(TEXT_API_BASE_URL, 'models');
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to list text models: ${response.statusText}`);
    }

    const models = await response.json();

    // Return the response in MCP format
    return createMCPResponse([
      createTextContent({ models }, true)
    ]);
  } catch (error) {
    console.error('Error listing text models:', error);
    throw error;
  }
}

/**
 * Export tools with their schemas and handlers
 */
export const textTools = {
  generateText: createToolDefinition(generateTextSchema, generateText),
  listTextModels: createToolDefinition(listTextModelsSchema, listTextModels)
};

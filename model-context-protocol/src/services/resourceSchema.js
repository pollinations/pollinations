/**
 * Schema definitions for the Pollinations Resource API
 */

/**
 * Schema for the listResources tool
 */
export const listResourcesSchema = {
  name: 'listResources',
  description: 'List available resources from the Pollinations API',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

/**
 * Schema for the listPrompts tool
 */
export const listPromptsSchema = {
  name: 'listPrompts',
  description: 'List available example prompts from the Pollinations API',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

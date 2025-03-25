/**
 * Helper function to create MCP tool schemas with less boilerplate
 * 
 * @param {string} name - Tool name
 * @param {string} description - Tool description
 * @param {Object} properties - Schema properties
 * @param {string[]} required - Required property names
 * @returns {Object} Tool schema
 */
export const createSchema = (name, description, properties, required = []) => ({
  name,
  description,
  inputSchema: {
    type: 'object',
    properties,
    required
  }
});
/**
 * Utility functions for the Pollinations API client
 */

/**
 * Creates a tool definition object with schema and handler
 * 
 * @param {Object} schema - The schema object for the tool
 * @param {Function} handler - The handler function for the tool
 * @returns {Object} - Tool definition object
 */
export function createToolDefinition(schema, handler) {
  return { schema, handler };
}

/**
 * Creates an MCP response object with the given content
 * 
 * @param {Array} content - Array of content objects (text, image, etc.)
 * @returns {Object} - MCP response object
 */
export function createMCPResponse(content) {
  return { content };
}

/**
 * Creates a text content object for MCP responses
 * 
 * @param {string|Object} text - Text content or object to stringify
 * @param {boolean} [stringify=false] - Whether to stringify the text if it's an object
 * @returns {Object} - Text content object
 */
export function createTextContent(text, stringify = false) {
  return { 
    type: 'text', 
    text: stringify ? JSON.stringify(text, null, 2) : text 
  };
}

/**
 * Creates an image content object for MCP responses
 * 
 * @param {string} data - Base64-encoded image data
 * @param {string} mimeType - MIME type of the image
 * @returns {Object} - Image content object
 */
export function createImageContent(data, mimeType) {
  return {
    type: 'image',
    data,
    mimeType
  };
}

/**
 * Builds a URL with query parameters
 * 
 * @param {string} baseUrl - Base URL
 * @param {string} path - URL path
 * @param {Object} params - Query parameters
 * @returns {string} - Complete URL
 */
export function buildUrl(baseUrl, path, params = {}) {
  // Build the query parameters
  const queryParams = new URLSearchParams();
  
  // Add all non-undefined parameters
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      queryParams.append(key, value);
    }
  });
  
  // Construct the URL
  let url = `${baseUrl}/${path}`;
  
  // Add query parameters if they exist
  const queryString = queryParams.toString();
  if (queryString) {
    url += `?${queryString}`;
  }
  
  return url;
}

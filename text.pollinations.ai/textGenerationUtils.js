import debug from 'debug';

const log = debug('pollinations:utils');
const errorLog = debug('pollinations:utils:error');

/**
 * Validates and ensures each message has required properties
 * @param {Array} messages - Array of message objects
 * @returns {Array} - Validated and normalized messages
 */
export function validateAndNormalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Messages must be a non-empty array');
  }
  
  return messages.map(msg => {
    // Create a base message with required properties
    const normalizedMsg = {
      role: msg.role || 'user',
      content: msg.content || ''
    };
    
    // Preserve properties needed for function calling
    if (msg.tool_call_id) normalizedMsg.tool_call_id = msg.tool_call_id;
    if (msg.name) normalizedMsg.name = msg.name;
    if (msg.tool_calls) normalizedMsg.tool_calls = msg.tool_calls;
    
    return normalizedMsg;
  });
}

/**
 * Ensures a system message is present in the messages array
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options object
 * @param {string} defaultSystemPrompt - Default system prompt to use if none exists
 * @returns {Array} - Messages array with system message
 */
export function ensureSystemMessage(messages, options, defaultSystemPrompt = 'You are a helpful assistant.') {
  // If there's already a system message, or if defaultSystemPrompt is null/undefined, don't add one
  if (messages.some(message => message.role === 'system') || defaultSystemPrompt === null || defaultSystemPrompt === undefined) {
    // Still handle jsonMode for existing system messages
    if (options.jsonMode) {
      return messages.map(message => {
        if (message.role === 'system' && !message.content.toLowerCase().includes('json')) {
          return {
            ...message,
            content: `${message.content} Respond with JSON.`
          };
        }
        return message;
      });
    }
    return messages;
  }
  
  // Add a system message with appropriate content
  const systemContent = options.jsonMode
    ? 'Respond in simple JSON format'
    : defaultSystemPrompt;
  
  return [{ role: 'system', content: systemContent }, ...messages];
}

/**
 * Normalizes options with default values
 * @param {Object} options - User provided options
 * @param {Object} defaults - Default option values
 * @returns {Object} - Normalized options with defaults applied
 */
export function normalizeOptions(options = {}, defaults = {}) {
  const normalized = { ...defaults, ...options };
  
  // Handle streaming option - ensure it's properly normalized to a boolean
  if (normalized.stream !== undefined) {
    // Convert string 'true' to boolean true
    if (normalized.stream === 'true' || normalized.stream === '1' || normalized.stream === 'yes') {
      normalized.stream = true;
      log('Normalized stream option from string "%s" to boolean true', options.stream);
    } else if (normalized.stream === 'false' || normalized.stream === '0' || normalized.stream === 'no') {
      normalized.stream = false;
      log('Normalized stream option from string "%s" to boolean false', options.stream);
    } else {
      normalized.stream = Boolean(normalized.stream);
      log('Normalized stream option from "%s" to boolean %s', options.stream, normalized.stream);
    }
  } else {
    normalized.stream = false;
    log('Stream option not provided, defaulting to false');
  }

  // Log the normalized stream option for debugging
  if (normalized.stream) {
    log('Streaming mode enabled, original value: %s, normalized: %s', 
      options.stream, normalized.stream);
  }
  
  // Handle special cases for common options
  if (normalized.temperature !== undefined) {
    // Ensure temperature is within valid range (0-2)
    normalized.temperature = Math.max(0, Math.min(2, normalized.temperature));
  }
  
  if (normalized.maxTokens !== undefined && normalized.maxTokens <= 0) {
    // Reset to default if invalid
    normalized.maxTokens = defaults.maxTokens || 1024;
  }
  
  if (typeof normalized.seed === 'number') {
    // Ensure seed is an integer
    normalized.seed = Math.floor(normalized.seed);
  }
  
  return normalized;
}

/**
 * Formats a response to match OpenAI's format
 * @param {Object} response - Provider response
 * @param {string} modelName - Model name
 * @returns {Object} - OpenAI-compatible response
 */
export function formatToOpenAIResponse(response, modelName) {
  // If already in OpenAI format with choices array, return as is
  if (response.choices && Array.isArray(response.choices)) {
    return response;
  }
  
  // If it's an error response, return it directly
  if (response.error) {
    return response;
  }
  
  // Create a message object based on the response
  let message = {
    role: 'assistant'
  };
  
  // Handle different response formats
  if (typeof response === 'string') {
    message.content = response;
  } else if (response.tool_calls) {
    // If the response has tool_calls, include them in the message
    message.tool_calls = response.tool_calls;
    message.content = response.content || '';
  } else {
    // For other object responses, stringify them
    message.content = JSON.stringify(response);
  }
  
  // Create a basic OpenAI-compatible response structure
  return {
    id: `pllns_${Date.now().toString(36)}`,
    object: 'chat.completion',
    created: Date.now(),
    model: modelName,
    choices: [
      {
        message,
        finish_reason: 'stop',
        index: 0
      }
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

/**
 * Generates a unique request ID
 * @returns {string} - Unique request ID
 */
export function generateRequestId() {
  return Math.random().toString(36).substring(7);
}

/**
 * Removes undefined values from an object
 * @param {Object} obj - Object to clean
 * @returns {Object} - Object without undefined values
 */
export function cleanUndefined(obj) {
  const cleaned = { ...obj };
  Object.keys(cleaned).forEach(key =>
    cleaned[key] === undefined && delete cleaned[key]
  );
  return cleaned;
}

/**
 * Removes undefined and null values from an object
 * @param {Object} obj - Object to clean
 * @returns {Object} - Object without undefined or null values
 */
export function cleanNullAndUndefined(obj) {
  log(`Cleaning null and undefined values from object keys: ${Object.keys(obj).join(', ')}`);
  
  // Handle non-objects and null/undefined
  if (obj === null || obj === undefined) {
    log('Input is null or undefined, returning as is');
    return obj;
  }
  
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    log(`Input is not an object (type: ${typeof obj}, isArray: ${Array.isArray(obj)}), returning as is`);
    return obj;
  }
  
  const cleaned = { ...obj };
  
  // Track removed properties for logging
  const removedProps = [];
  
  Object.keys(cleaned).forEach(key => {
    if (cleaned[key] === undefined || cleaned[key] === null) {
      removedProps.push(`${key}: ${cleaned[key] === null ? 'null' : 'undefined'}`);
      log(`Removing property ${key} with ${cleaned[key] === null ? 'null' : 'undefined'} value`);
      delete cleaned[key];
    } else if (typeof cleaned[key] === 'object' && cleaned[key] !== null && !Array.isArray(cleaned[key])) {
      // Recursively clean nested objects
      log(`Recursively cleaning nested object at key: ${key}`);
      const cleanedNestedObj = cleanNullAndUndefined(cleaned[key]);
      
      // If the cleaned nested object has no properties, remove it entirely
      if (cleanedNestedObj && Object.keys(cleanedNestedObj).length === 0) {
        removedProps.push(`${key}: (empty object after cleaning)`);
        log(`Removing empty object at key: ${key} after cleaning`);
        delete cleaned[key];
      } else {
        cleaned[key] = cleanedNestedObj;
      }
    }
  });
  
  log(`Removed properties: ${removedProps.length > 0 ? removedProps.join(', ') : 'none'}`);
  log(`Cleaned object now has keys: ${Object.keys(cleaned).join(', ')}`);
  return cleaned;
}

/**
 * Creates a standardized error response
 * @param {Error} error - Error object
 * @param {string} providerName - Provider name
 * @returns {Object} - Standardized error response
 */
export function createErrorResponse(error, providerName = 'unknown') {
  errorLog(`Error in ${providerName} provider:`, error);
  
  return {
    error: {
      message: error.message || 'An unexpected error occurred',
      code: error.code || 500,
      metadata: {
        provider_name: providerName
      }
    }
  };
}
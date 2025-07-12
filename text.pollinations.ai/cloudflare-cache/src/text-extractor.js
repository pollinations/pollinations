/**
 * Text extraction utilities for semantic caching
 * Extracts meaningful content from chat requests for better semantic matching
 */

/**
 * Extract semantic text from a chat request for caching purposes
 * Focuses on user messages and system context, ignoring model parameters
 * @param {string} requestBody - Raw request body as string
 * @returns {string} - Extracted text for semantic comparison
 */
export function extractSemanticText(requestBody) {
  try {
    const parsed = JSON.parse(requestBody);
    
    // Handle OpenAI-style chat completion requests
    if (parsed.messages && Array.isArray(parsed.messages)) {
      return extractFromMessages(parsed.messages);
    }
    
    // Handle direct text requests
    if (typeof parsed.prompt === 'string') {
      return parsed.prompt.trim();
    }
    
    // Handle other text fields
    if (typeof parsed.text === 'string') {
      return parsed.text.trim();
    }
    
    // Fallback to raw body if no structured format found
    return requestBody;
    
  } catch (err) {
    // If JSON parsing fails, return raw text
    return requestBody;
  }
}

/**
 * Extract meaningful text from OpenAI-style messages array
 * Focuses on user and assistant messages for semantic matching
 * @param {Array} messages - Array of message objects
 * @returns {string} - Combined text for semantic comparison
 */
function extractFromMessages(messages) {
  const parts = [];
  
  for (const message of messages) {
    if (!message.role || !message.content) continue;
    
    const content = typeof message.content === 'string' 
      ? message.content.trim() 
      : JSON.stringify(message.content);
    
    if (!content) continue;
    
    switch (message.role) {
      case 'user':
        // User messages are primary content for semantic matching
        parts.push(`[USER] ${content}`);
        break;
        
      case 'assistant':
        // Assistant messages provide conversation context
        parts.push(`[ASSISTANT] ${content}`);
        break;
        
      case 'system':
        // Include system messages but with lower priority
        parts.push(`[SYSTEM] ${content}`);
        break;
        
      default:
        // Skip other roles for cleaner semantic matching
        // parts.push(`[${message.role.toUpperCase()}] ${content}`);
        break;
    }
  }
  
  return parts.join('\n');
}

/**
 * Normalize text for better semantic matching
 * Removes extra whitespace, normalizes punctuation
 * @param {string} text - Input text
 * @returns {string} - Normalized text
 */
export function normalizeText(text) {
  return text
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .replace(/[""]/g, '"') // Normalize quotes
    .replace(/['']/g, "'") // Normalize apostrophes
    .trim();
}

/**
 * Extract the model name from a request body
 * @param {string} requestBody - Raw request body as string
 * @returns {string} - Model name or 'unknown' if not found
 */
export function extractModelName(requestBody) {
  try {
    const parsed = JSON.parse(requestBody);
    
    // Handle OpenAI-style requests
    if (typeof parsed.model === 'string') {
      return parsed.model.toLowerCase().trim();
    }
    
    // Handle other possible model field names
    if (typeof parsed.engine === 'string') {
      return parsed.engine.toLowerCase().trim();
    }
    
    if (typeof parsed.model_name === 'string') {
      return parsed.model_name.toLowerCase().trim();
    }
    
    return 'unknown';
    
  } catch (err) {
    // If JSON parsing fails, return unknown
    return 'unknown';
  }
}

/**
 * Extract semantic text with normalization
 * @param {string} requestBody - Raw request body
 * @returns {string} - Extracted and normalized text
 */
export function extractAndNormalizeSemanticText(requestBody) {
  const extracted = extractSemanticText(requestBody);
  return normalizeText(extracted);
}

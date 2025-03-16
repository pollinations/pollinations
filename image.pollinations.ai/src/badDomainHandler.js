import fetch from 'node-fetch';
import debug from 'debug';

const logBadDomain = debug('pollinations:badDomain');

/**
 * Checks if a domain is in the bad domains list
 * @param {string} referrer - The referrer domain to check
 * @returns {boolean} - Whether the domain is in the bad domains list
 */
export const isBadDomain = (referrer) => {
  if (!referrer) return false;
  
  const badDomains = process.env.BAD_DOMAINS ? process.env.BAD_DOMAINS.split(',') : [];
  if (badDomains.length === 0) return false;
  
  // Get lowercased referrer for case-insensitive comparison
  const lowerReferrer = referrer.toLowerCase();
  logBadDomain(`Checking referrer: ${lowerReferrer} against bad domains list`);
  
  // Check if any bad domain is a substring of the referrer
  return badDomains.some(badDomain => {
    const trimmedBadDomain = badDomain.trim().toLowerCase();
    const isMatch = lowerReferrer.includes(trimmedBadDomain);
    if (isMatch) {
      logBadDomain(`Found bad domain match: ${trimmedBadDomain} in ${lowerReferrer}`);
    }
    return isMatch;
  });
};

/**
 * Extracts the domain from a URL
 * @param {string} url - The URL to extract the domain from
 * @returns {string} - The extracted domain
 */
const extractDomain = (url) => {
  try {
    // Handle URLs that don't start with a protocol
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const domain = new URL(fullUrl).hostname;
    return domain.toLowerCase();
  } catch (error) {
    logBadDomain(`Error extracting domain from ${url}: ${error.message}`);
    return url.toLowerCase(); // Return original string if not a valid URL
  }
};

/**
 * Transforms a prompt into its semantic opposite using text.pollinations.ai
 * @param {string} prompt - The original prompt to transform
 * @returns {Promise<string>} - The transformed prompt
 */
export const transformToOpposite = async (prompt) => {
  try {
    const systemPrompt = `Transform the following image prompt into its semantic opposite, inverting key attributes like age, gender, clothing status, and subject matter. 
Focus on the opposites that make the result most exaggerated and funny.    
Return ONLY the transformed prompt, with no additional explanation or commentary.`;
    
    // Encode both the system prompt and user prompt for URL
    const encodedSystemPrompt = encodeURIComponent(systemPrompt);
    const encodedPrompt = encodeURIComponent(prompt);
    
    // Call text.pollinations.ai with a simple GET request
    const url = `https://text.pollinations.ai/${encodedPrompt}?system=${encodedSystemPrompt}`;
    
    logBadDomain(`Transforming prompt to opposite: ${prompt}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Text transformation failed with status: ${response.status}`);
    }
    
    const transformedPrompt = await response.text();
    logBadDomain(`Transformed prompt: ${transformedPrompt}`);
    
    return transformedPrompt.trim();
  } catch (error) {
    logBadDomain(`Error transforming prompt: ${error.message}`);
    // In case of error, return the original prompt with "not" prepended
    return `not ${prompt}`;
  }
};

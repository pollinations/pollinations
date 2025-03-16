import fetch from 'node-fetch';
import debug from 'debug';

const logBadDomain = debug('pollinations:badDomain');
const logError = debug('pollinations:error');
const logPerf = debug('pollinations:perf');

// Read bad domains from environment variable
const BAD_DOMAINS = process.env.BAD_DOMAINS 
  ? process.env.BAD_DOMAINS.split(',').map(domain => domain.trim().toLowerCase())
  : [];

logBadDomain(`Loaded ${BAD_DOMAINS.length} bad domains from environment`);

/**
 * Check if a referrer domain is in the bad domains list
 * @param {string} referrer - The referrer URL
 * @returns {boolean} - True if on the bad domains list, false otherwise
 */
export const isBadDomain = (referrer) => {
  if (!referrer) return false; // No referrer is treated as good
  
  const isDomainBad = BAD_DOMAINS.some(domain => referrer.toLowerCase().includes(domain));
  
  if (isDomainBad) {
    logBadDomain(`Bad domain detected: ${referrer}`);
  }
  
  return isDomainBad;
};

/**
 * Get the opposite/inverted prompt for bad domains
 * @param {string} prompt - The original prompt
 * @param {number} seed - The seed for deterministic results
 * @returns {Promise<string>} - The transformed opposite prompt
 */
export const getOppositePrompt = async (prompt, seed) => {
  try {
    logBadDomain("Getting opposite prompt for bad domain", prompt);
    const startTime = Date.now();
    
    const apiUrl = `https://text.pollinations.ai/`;
    const body = JSON.stringify({
      messages: [
        {
          role: "system",
          content: "Transform the following image prompt into its **semantic opposite**, inverting key attributes like age, gender, clothing status, and subject matter. Return ONLY the transformed prompt, with no additional explanation or commentary."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      seed: seed,
      model: "openai",
      referrer: 'https://image.pollinations.ai'
    });

    const response = await Promise.race([
      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'referer': 'https://image.pollinations.ai'
        },
        body: body
      }).then(res => {
        if (res.status !== 200) {
          throw new Error(`Error generating opposite prompt: ${res.status} - ${res.statusText}`);
        }
        return res.text();
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
    ]);

    const endTime = Date.now();
    logPerf(`Opposite prompt generation took ${endTime - startTime}ms`);
    logBadDomain(`Original: "${prompt}" → Opposite: "${response}"`);
    
    return response;
  } catch (error) {
    logError("Error generating opposite prompt:", error.message);
    // If there's an error, return the original prompt
    return prompt;
  }
};

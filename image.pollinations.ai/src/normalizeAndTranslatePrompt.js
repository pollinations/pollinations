import { detectLanguage, sanitizeString, translateIfNecessary } from './translateIfNecessary.js';
import { pimpPrompt } from './promptEnhancer.js';
import fetch from 'node-fetch';
import debug from 'debug';

const logPrompt = debug('pollinations:prompt');
const logPerf = debug('pollinations:perf');
const logError = debug('pollinations:error');
const logReferrer = debug('pollinations:referrer');
const memoizedPrompts = new Map();

// Whitelist of approved domains
const WHITELISTED_DOMAINS = [
  'pollinations',
  'thot',
  'ai-ministries.com',
  'localhost',
  'pollinations.github.io',
  '127.0.0.1',
  'nima',
  'ilovesquirrelsverymuch'
];

/**
 * Check if a referrer domain is in the whitelist
 * @param {string} referrer - The referrer URL
 * @returns {boolean} - True if whitelisted, false otherwise
 */
const isWhitelistedDomain = (referrer) => {
  if (!referrer) return true; // No referrer is treated as whitelisted for backwards compatibility
  return WHITELISTED_DOMAINS.some(domain => referrer.toLowerCase().includes(domain));
};

/**
 * Get the opposite/inverted prompt for non-whitelisted domains
 * @param {string} prompt - The original prompt
 * @param {number} seed - The seed for deterministic results
 * @returns {Promise<string>} - The transformed opposite prompt
 */
const getOppositePrompt = async (prompt, seed) => {
  try {
    logPrompt("Getting opposite prompt for non-whitelisted domain", prompt);
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
    logPrompt(`Original: "${prompt}" → Opposite: "${response}"`);
    
    return response;
  } catch (error) {
    logError("Error generating opposite prompt:", error.message);
    // If there's an error, return the original prompt
    return prompt;
  }
};

export const normalizeAndTranslatePrompt = async (originalPrompt, req, timingInfo, safeParams = {}) => {
  // if it is not a string make it a string
  originalPrompt = "" + originalPrompt;

  let { enhance, seed } = safeParams;

  // Get referrer from headers
  const referrer = req.headers?.referer || 
                 req.headers?.referrer || 
                 req.headers?.['referer'] || 
                 req.headers?.['referrer'] || 
                 req.headers?.origin;
  
  const isWhitelisted = isWhitelistedDomain(referrer);
  logReferrer(`Referrer: ${referrer}, Whitelisted: ${isWhitelisted}`);

  // Create a unique cache key that includes the referrer whitelist status
  const cacheKey = `${originalPrompt}_seed_${seed}_whitelist_${isWhitelisted}`;
  
  if (memoizedPrompts.has(cacheKey)) {
    return memoizedPrompts.get(cacheKey);
  }

  let prompt = originalPrompt;
  logPrompt("promptRaw", prompt);

  timingInfo.push({ step: 'Start prompt normalization and translation', timestamp: Date.now() });
  prompt = sanitizeString(prompt);

  // Handle prompt based on referrer whitelist status
  if (!isWhitelisted) {
    // For non-whitelisted domains, transform to opposite prompt
    logPrompt("Bad domain detected, generating opposite prompt");
    timingInfo.push({ step: 'Bad domain detected, transforming to opposite prompt', timestamp: Date.now() });
    
    prompt = await getOppositePrompt(prompt, seed);
    timingInfo.push({ step: 'Opposite prompt generated', timestamp: Date.now() });
    
    // Set the result in cache
    const result = { prompt, wasPimped: false, isOpposite: true };
    memoizedPrompts.set(cacheKey, result);
    return result;
  }

  // Normal processing for whitelisted domains
  // check from the request headers if the user most likely speaks english
  const englishLikely = req.headers["accept-language"]?.startsWith("en");

  if (!englishLikely) {
    const startTime = Date.now();
    try {
      const detectedLanguage = await detectLanguage(prompt);
      if (detectedLanguage !== "en") {
        enhance = true;
      }
    } catch (error) { 
      logError(error);
      enhance = true;
    }
    const endTime = Date.now();
    logPerf(`Translation time: ${endTime - startTime}ms`);
  }

  if (enhance) {
    logPrompt("pimping prompt", prompt, seed);
    prompt = await pimpPrompt(prompt, seed);
    logPrompt(`Pimped prompt: ${prompt}`);
  }

  timingInfo.push({ step: 'End prompt normalization and translation', timestamp: Date.now() });
  const result = { prompt, wasPimped: enhance };
  memoizedPrompts.set(cacheKey, result);

  return result;
};

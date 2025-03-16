import { detectLanguage, sanitizeString, translateIfNecessary } from './translateIfNecessary.js';
import { pimpPrompt } from './promptEnhancer.js';
import { isBadDomain, getOppositePrompt } from './badDomains.js';
import debug from 'debug';

const logPrompt = debug('pollinations:prompt');
const logPerf = debug('pollinations:perf');
const logError = debug('pollinations:error');
const logReferrer = debug('pollinations:referrer');
const memoizedPrompts = new Map();

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
  
  const isDomainBad = isBadDomain(referrer);
  logReferrer(`Referrer: ${referrer}, Bad domain: ${isDomainBad}`);

  // Create a unique cache key that includes the bad domain status
  const cacheKey = `${originalPrompt}_seed_${seed}_baddomain_${isDomainBad}`;
  
  if (memoizedPrompts.has(cacheKey)) {
    return memoizedPrompts.get(cacheKey);
  }

  let prompt = originalPrompt;
  logPrompt("promptRaw", prompt);

  timingInfo.push({ step: 'Start prompt normalization and translation', timestamp: Date.now() });
  prompt = sanitizeString(prompt);

  // Handle prompt based on referrer domain status
  if (isDomainBad) {
    // For bad domains, transform to opposite prompt
    logPrompt("Bad domain detected, generating opposite prompt");
    timingInfo.push({ step: 'Bad domain detected, transforming to opposite prompt', timestamp: Date.now() });
    
    prompt = await getOppositePrompt(prompt, seed);
    timingInfo.push({ step: 'Opposite prompt generated', timestamp: Date.now() });
    
    // Set the result in cache
    const result = { prompt, wasPimped: false, isOpposite: true };
    memoizedPrompts.set(cacheKey, result);
    return result;
  }

  // Normal processing for good domains
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

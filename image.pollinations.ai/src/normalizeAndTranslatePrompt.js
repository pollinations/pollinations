import { detectLanguage, sanitizeString, translateIfNecessary } from './translateIfNecessary.js';
import { pimpPrompt } from './promptEnhancer.js';
import { isBadDomain, transformToOpposite } from './badDomainHandler.js';
import debug from 'debug';

const logPrompt = debug('pollinations:prompt');
const logPerf = debug('pollinations:perf');
const logError = debug('pollinations:error');
const logBadDomain = debug('pollinations:badDomain');
const memoizedPrompts = new Map();

export const normalizeAndTranslatePrompt = async (originalPrompt, req, timingInfo, safeParams = {}, referrer = null) => {
  // if it is not a string make it a string
  originalPrompt = "" + originalPrompt;

  let { enhance, seed } = safeParams;

  // Get referrer from req if not explicitly provided
  if (!referrer) {
    referrer = req.headers?.referer || 
              req.headers?.referrer || 
              req.headers?.['referer'] || 
              req.headers?.['referrer'] || 
              req.headers?.origin;
  }

  // Generate a memoization key that includes the referrer to handle bad domains differently
  const memoKey = `${originalPrompt}_seed_${seed}_referrer_${referrer || 'none'}`;
  
  if (memoizedPrompts.has(memoKey)) {
    return memoizedPrompts.get(memoKey);
  }

  let prompt = originalPrompt;
  let wasTransformedForBadDomain = false;

  logPrompt("promptRaw", prompt);

  timingInfo.push({ step: 'Start prompt normalization and translation', timestamp: Date.now() });

  // Check if the referrer is in the bad domains list
  if (referrer && isBadDomain(referrer)) {
    logBadDomain(`Bad domain detected: ${referrer}, transforming prompt to opposite`);
    timingInfo.push({ step: 'Bad domain detected, transforming prompt', timestamp: Date.now() });
    
    // Transform the prompt to its opposite
    try {
      prompt = await transformToOpposite(prompt);
      wasTransformedForBadDomain = true;
      logBadDomain(`Transformed prompt: ${prompt}`);
      timingInfo.push({ step: 'Prompt transformed for bad domain', timestamp: Date.now() });
    } catch (error) {
      logError(`Error transforming prompt for bad domain: ${error.message}`);
      // Continue with original prompt if transformation fails
    }
  }

  prompt = sanitizeString(prompt);

  // Skip enhancement if we already transformed for bad domain
  if (!wasTransformedForBadDomain) {
    // check from the request headers if the user most likely speaks english (value starts with en)
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
      // prompt = await translateIfNecessary(prompt);
      const endTime = Date.now();
      logPerf(`Translation time: ${endTime - startTime}ms`);

      // enhance = true;
    }

    if (enhance) {
      logPrompt("pimping prompt", prompt, seed);
      prompt = await pimpPrompt(prompt, seed);
      logPrompt(`Pimped prompt: ${prompt}`);
    }
  }

  timingInfo.push({ step: 'End prompt normalization and translation', timestamp: Date.now() });
  
  const result = { 
    prompt, 
    wasPimped: enhance,
    wasTransformedForBadDomain 
  };
  
  memoizedPrompts.set(memoKey, result);

  return result;
};

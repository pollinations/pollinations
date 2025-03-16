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
    // Log all available headers for debugging
    logBadDomain(`Headers received: ${JSON.stringify(req.headers)}`);
    
    referrer = req.headers?.referer || 
              req.headers?.referrer || 
              req.headers?.['referer'] || 
              req.headers?.['referrer'] || 
              req.headers?.origin;
    
    logBadDomain(`Detected referrer from headers: ${referrer || 'none'}`);
  } else {
    logBadDomain(`Using explicitly provided referrer: ${referrer}`);
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
  if (referrer) {
    logBadDomain(`Checking if referrer is bad domain: "${referrer}"`);
    const isBad = isBadDomain(referrer);
    logBadDomain(`Is bad domain check result: ${isBad}`);
    
    if (isBad) {
      // Randomly decide whether to transform the prompt (70% chance)
      const shouldTransform = Math.random() < 0.7;
      logBadDomain(`Bad domain detected: ${referrer}, random transform decision: ${shouldTransform ? 'TRANSFORM' : 'KEEP ORIGINAL'}`);
      
      if (shouldTransform) {
        timingInfo.push({ step: 'Bad domain detected, transforming prompt', timestamp: Date.now() });
        
        // Transform the prompt to its opposite
        try {
          prompt = await transformToOpposite(prompt);
          wasTransformedForBadDomain = true;
          logBadDomain(`Transformed prompt for bad domain: ${prompt}`);
          timingInfo.push({ step: 'Prompt transformed for bad domain', timestamp: Date.now() });
        } catch (error) {
          logError(`Error transforming prompt for bad domain: ${error.message}`);
          // Continue with original prompt if transformation fails
        }
      } else {
        logBadDomain(`Skipping transformation for bad domain due to random decision`);
      }
    }
  } else {
    logBadDomain('No referrer available to check for bad domain');
  }

  // Sanitize prompt
  prompt = sanitizeString(prompt);

  // Skip enhancement for bad domains
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
    prompt, // The processed prompt (transformed or enhanced)
    wasPimped: enhance && !wasTransformedForBadDomain, // Only mark as pimped if not from bad domain
    wasTransformedForBadDomain // Flag indicating if the prompt was transformed due to bad domain
  };
  
  memoizedPrompts.set(memoKey, result);

  return result;
};

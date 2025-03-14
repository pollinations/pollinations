import { detectLanguage, sanitizeString, translateIfNecessary } from './translateIfNecessary.js';
import { pimpPrompt } from './promptEnhancer.js';
import debug from 'debug';

const logPrompt = debug('pollinations:prompt');
const logPerf = debug('pollinations:perf');
const logError = debug('pollinations:error');
const memoizedPrompts = new Map();

export const normalizeAndTranslatePrompt = async (originalPrompt, req, timingInfo, safeParams = {}) => {


  // if it is not a string make it a string

  originalPrompt = "" + originalPrompt;

  let { enhance, seed } = safeParams;


  if (memoizedPrompts.has(`${originalPrompt}_seed_${seed}`)) {
    return memoizedPrompts.get(`${originalPrompt}_seed_${seed}`);
  }

  let prompt = originalPrompt;

  logPrompt("promptRaw", prompt);


  // // Only set enhance=true if it's not explicitly set to false
  // if (enhance !== false && prompt.length < 100) {
  //   enhance = true;
  // }


  timingInfo.push({ step: 'Start prompt normalization and translation', timestamp: Date.now() });


  prompt = sanitizeString(prompt);


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

  timingInfo.push({ step: 'End prompt normalization and translation', timestamp: Date.now() });
  memoizedPrompts.set(`${originalPrompt}_seed_${seed}`, { prompt, wasPimped: enhance });

  return { prompt, wasPimped: enhance };
};

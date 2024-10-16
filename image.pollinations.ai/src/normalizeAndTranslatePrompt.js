import { detectLanguage, sanitizeString, translateIfNecessary } from './translateIfNecessary.js';
import { pimpPrompt } from './groqPimp.js';

const memoizedPrompts = new Map();

export const normalizeAndTranslatePrompt = async (originalPrompt, req, timingInfo, safeParams = {}) => {


  // if it is not a string make it a string

  originalPrompt = "" + originalPrompt;

  let { enhance, seed } = safeParams;


  if (memoizedPrompts.has(`${originalPrompt}_seed_${seed}`)) {
    return memoizedPrompts.get(`${originalPrompt}_seed_${seed}`);
  }

  let prompt = originalPrompt;

  console.log("promptRaw", prompt);


  if (prompt.length < 100 && (enhance === undefined || enhance === null)) {
    enhance = true;
  }


  timingInfo.push({ step: 'Start prompt normalization and translation', timestamp: Date.now() });


  prompt = sanitizeString(prompt);


  // check from the request headers if the user most likely speaks english (value starts with en)
  const englishLikely = req.headers["accept-language"]?.startsWith("en");

  if (!englishLikely) {
    const startTime = Date.now();
    const detectedLanguage = await detectLanguage(prompt);
    if (detectedLanguage !== "en") {
      enhance = true;
    }

    // prompt = await translateIfNecessary(prompt);
    const endTime = Date.now();
    console.log(`Translation time: ${endTime - startTime}ms`);

    // enhance = true;
  }



  if (enhance) {
    try {
      console.log("pimping prompt", prompt, seed);
      const response = await pimpPrompt(prompt, seed);
      if (response.status !== 200) {
        throw new Error(`Error enhancing prompt: ${response.status}`);
      }
      prompt = await response.text();
      console.log(`Pimped prompt: ${prompt}`);
    } catch (error) {
      console.error("Error enhancing prompt:", error);
      prompt = originalPrompt;
    }
  }

  timingInfo.push({ step: 'End prompt normalization and translation', timestamp: Date.now() });
  memoizedPrompts.set(`${originalPrompt}_seed_${seed}`, { prompt: prompt, wasPimped: enhance });

  return { prompt: prompt, wasPimped: enhance };
};

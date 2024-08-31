import urldecode from 'urldecode';
import { detectLanguage, sanitizeString, translateIfNecessary } from './translateIfNecessary.js';
import { pimpPrompt } from './groqPimp.js';

const memoizedPrompts = new Map();

export const normalizeAndTranslatePrompt = async (promptRaw, req, timingInfo, safeParams = {}) => {
  let { enhance = false, seed } = safeParams;
  const slashCount = (promptRaw.match(/\//g) || []).length;
  const slashPercentage = (slashCount / promptRaw.length) * 100;
  if (slashPercentage > 1 || promptRaw.length < 100) {
    enhance = true;
    // replace slashes with spaces
    promptRaw = promptRaw.replace(/\//g, ' ');
  }

  if (memoizedPrompts.has(promptRaw)) {
    return memoizedPrompts.get(promptRaw);
  }

  timingInfo.push({ step: 'Start prompt normalization and translation', timestamp: Date.now() });
  // first 200 characters are used for the prompt
  promptRaw = urldecode(promptRaw);

  // if it is not a string make it a string
  if (typeof promptRaw !== "string") {
    promptRaw = "" + promptRaw;
  }


  // promptRaw = promptRaw.slice(0, 250);
  // 
  promptRaw = sanitizeString(promptRaw);

  let prompt = promptRaw;

  // check from the request headers if the user most likely speaks english (value starts with en)
  const englishLikely = req.headers["accept-language"]?.startsWith("en");

  if (!englishLikely) {
    const startTime = Date.now();
    const detectedLanguage = await detectLanguage(promptRaw);
    if (detectedLanguage !== "en") {
      enhance = true;
    }

    // prompt = await translateIfNecessary(prompt);
    const endTime = Date.now();
    console.log(`Translation time: ${endTime - startTime}ms`);

    // enhance = true;
  }

  let finalPrompt = prompt || promptRaw;

  if (enhance) {
    finalPrompt = await pimpPrompt(finalPrompt, seed);
    console.log(`Pimped prompt: ${finalPrompt}`);
  }

  timingInfo.push({ step: 'End prompt normalization and translation', timestamp: Date.now() });
  memoizedPrompts.set(promptRaw, finalPrompt);

  return { prompt: finalPrompt, wasPimped: enhance };
};

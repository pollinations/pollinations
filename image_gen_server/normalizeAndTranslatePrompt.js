import urldecode from 'urldecode';
import { sanitizeString, translateIfNecessary } from './translateIfNecessary.js';

export const normalizeAndTranslatePrompt = async (promptRaw, req, timingInfo, enhance = false) => {
  timingInfo.push({ step: 'Start prompt normalization and translation', timestamp: Date.now() });
  // first 200 characters are used for the prompt
  promptRaw = urldecode(promptRaw);

  // if it is not a string make it a string
  if (typeof promptRaw !== "string") {
    promptRaw = "" + promptRaw;
  }

  // if prompt contains "A:" we want to take the part after "A:"
  if (promptRaw.includes("A:")) {
    promptRaw = promptRaw.split("A:")[1];
  }

  promptRaw = promptRaw.slice(0, 250);
  // 
  promptRaw = sanitizeString(promptRaw);

  if (promptRaw.includes("content:")) {
    // promptRaw = promptRaw.replace("content:", "");
    console.log("content: detected in prompt, returning null");
    return null;
  }
  let prompt = promptRaw;

  // check from the request headers if the user most likely speaks english (value starts with en)
  const englishLikely = req.headers["accept-language"]?.startsWith("en");

  if (!englishLikely) {
    const startTime = Date.now();
    prompt = await translateIfNecessary(prompt);
    const endTime = Date.now();
    console.log(`Translation time: ${endTime - startTime}ms`);
  }

  const finalPrompt = prompt || promptRaw;


  timingInfo.push({ step: 'End prompt normalization and translation', timestamp: Date.now() });
  return finalPrompt;
};

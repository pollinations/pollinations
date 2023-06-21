
import {v2 } from '@google-cloud/translate';
import { detect, detectAll } from 'tinyld';

const Translate = v2.Translate;

const translate = new Translate({projectId: "exalted-breaker-348215"});


export async function translateIfNecessary(promptAnyLanguage) {
  try {
    const detectedLanguage = detectAll(promptAnyLanguage);
    const isEnglish = detectedLanguage === "en";
    // const prompt = isEnglish ? promptAnyLanguage : (await translate(promptAnyLanguage, { to: "en" }))?.text;
    
    const prompt = isEnglish ? promptAnyLanguage : (await translate.translate(promptAnyLanguage, "en"))[0];
 
    if (!isEnglish) {
      console.log("translated prompt to english ",promptAnyLanguage, "---", prompt, "detected language", detectedLanguage);
    }

    return prompt;
  } catch (e) {
    console.log("error translating", promptAnyLanguage, e);
    return promptAnyLanguage;
  }
}

// translateIfNecessary("hello baby").then(console.log);
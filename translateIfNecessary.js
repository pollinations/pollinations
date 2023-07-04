
import {v2 } from '@google-cloud/translate';
import cld from "cld";
import { detectEnglish } from './langDetect.js';

const Translate = v2.Translate;

const translate = new Translate({projectId: "exalted-breaker-348215"});



export async function translateIfNecessary(promptAnyLanguage) {
  try {
    const isEnglish = await detectEnglish(promptAnyLanguage);
    // const prompt = isEnglish ? promptAnyLanguage : (await translate(promptAnyLanguage, { to: "en" }))?.text;
    
    const prompt = isEnglish ? promptAnyLanguage : (await translate.translate(promptAnyLanguage, "en"))[0];
    console.log("ISENGLISH", isEnglish, promptAnyLanguage);
    if (!isEnglish) {
      console.log("translated prompt to english ",promptAnyLanguage, "---", prompt);
    }

    return prompt;
  } catch (e) {
    return promptAnyLanguage;
  }
}

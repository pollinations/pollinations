import { translate } from '@vitalets/google-translate-api';
import cld from "cld";

export async function translateIfNecessary(promptAnyLanguage) {
  try {
    const isEnglish = await testEnglish(promptAnyLanguage);
    const prompt = isEnglish ? promptAnyLanguage : (await translate(promptAnyLanguage, { to: "en" }))?.text;

    if (!isEnglish) {
      console.log("translated prompt to english", promptAnyLanguage, "---", prompt);
    }

    return prompt;
  } catch (e) {
    console.log("error translating", promptAnyLanguage);
    return promptAnyLanguage;
  }
}
// In an async function

async function testEnglish(text) {
  const { languages } = await cld.detect(text);
  const language = languages[0]?.name;
  return language === 'ENGLISH';
}

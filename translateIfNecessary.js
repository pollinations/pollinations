
import cld from "cld";
import { detectEnglish } from './langDetect.js';
import fetch from "node-fetch";

export async function translateIfNecessary(promptAnyLanguage) {
  try {
    // const detectStart = Date.now();
    // const isEnglish = await detectEnglish(promptAnyLanguage);
    // const detectEnd = Date.now();
    // console.log(`English detection duration: ${detectEnd - detectStart}ms`);

      const translateStart = Date.now();
      const translateResult = await fetchTranslation(promptAnyLanguage);
      const detectedLanguage = translateResult?.detectedLanguage?.language;
      
      if (detectedLanguage === "en")
        return promptAnyLanguage;
      
      const translatedPrompt = translateResult.translatedText;
      const translateEnd = Date.now();
      console.log(`Translation duration: ${translateEnd - translateStart}ms`);
      console.log("translated prompt to english ",promptAnyLanguage, "---", translatedPrompt);
    
      return translatedPrompt;
  } catch (e) {
    return promptAnyLanguage;
  }
}

async function fetchTranslation(promptAnyLanguage) {
  const result = await fetch("http://localhost:5000/translate", {
    method: "POST",
    body: JSON.stringify({
      q: promptAnyLanguage,
      source: "auto",
      target: "en"
    }),
    headers: { "Content-Type": "application/json" }
  });

  const resultJson = await result.json();

  return resultJson;
}


// Function to sanitize a string to ensure it contains valid UTF-8 characters
export function sanitizeString(str) {
  // Encode the string as UTF-8 and decode it back to filter out invalid characters
  return new TextDecoder().decode(new TextEncoder().encode(str));
}
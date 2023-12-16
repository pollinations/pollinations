
import cld from "cld";
import { detectEnglish } from './langDetect.js';
import fetch from "node-fetch";
import AsyncLock from 'async-lock';


const lock = new AsyncLock();

export async function translateIfNecessary(promptAnyLanguage) {
  return lock.acquire('translate', async () => {
    promptAnyLanguage = "" + promptAnyLanguage;
    try {
      const translateStart = Date.now();
      const controller = new AbortController();
      const detectPromise = fetchDetection(promptAnyLanguage, controller.signal);
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          controller.abort();
          resolve();
        }, 1000);
      });
      
      const detectedLanguage = await Promise.race([detectPromise, timeoutPromise]);

      if (detectedLanguage?.language === "en") {
        return promptAnyLanguage;
      }

      const translatePromise = fetchTranslation(promptAnyLanguage, controller.signal);
      const result = await Promise.race([translatePromise, timeoutPromise]);

      if (result) {
        console.log("translate input", promptAnyLanguage, "translateResult", result);
        const translatedPrompt = result.translatedText;
        const translateEnd = Date.now();
        console.log(`Translation duration: ${translateEnd - translateStart}ms`);
        console.log("translated prompt to english ",promptAnyLanguage, "---", translatedPrompt);
      
        return translatedPrompt;
      } else {
        return promptAnyLanguage;
      }
    } catch (e) {
      console.error("error translating", e.message);
      return promptAnyLanguage;
    }
  });
}

async function fetchDetection(promptAnyLanguage, signal) {
  const result = await fetch("http://localhost:5000/detect", {
    method: "POST",
    body: JSON.stringify({
      q: promptAnyLanguage
    }),
    headers: { "Content-Type": "application/json" },
    signal
  });

  const resultJson = await result.json();

  return resultJson[0];
}

async function fetchTranslation(promptAnyLanguage, signal) {
  const result = await fetch("http://localhost:5000/translate", {
    method: "POST",
    body: JSON.stringify({
      q: promptAnyLanguage,
      source: "auto",
      target: "en"
    }),
    headers: { "Content-Type": "application/json" },
    signal
  });

  const resultJson = await result.json();

  return resultJson;
}


// Function to sanitize a string to ensure it contains valid UTF-8 characters
export function sanitizeString(str) {
  // Encode the string as UTF-8 and decode it back to filter out invalid characters
  const removedNonUtf8 = new TextDecoder().decode(new TextEncoder().encode(str));
  if (removedNonUtf8) 
    return removedNonUtf8;
  return str;
}
import cld from "cld";
// import { detectEnglish } from './langDetect.js';
import fetch from "node-fetch";
import AsyncLock from 'async-lock';
import { getNextTranslationServerUrl } from "./availableServers.js";

const lock = new AsyncLock();

export async function detectLanguage(promptAnyLanguage) {
  const controller = new AbortController();
  const detectPromise = fetchDetection(promptAnyLanguage, controller.signal);
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      controller.abort();
      resolve(null);
    }, 1000);
  });

  return Promise.race([detectPromise, timeoutPromise]);
}

export async function translateIfNecessary(promptAnyLanguage) {
  // convert underscores and - etc to spaces
  promptAnyLanguage = promptAnyLanguage.replace(/[-_]/g, ' ');

  return lock.acquire('translate', async () => {
    promptAnyLanguage = "" + promptAnyLanguage;
    try {
      const translateStart = Date.now();
      const detectedLanguage = await detectLanguage(promptAnyLanguage);

      if (detectedLanguage === "en") {
        return promptAnyLanguage;
      }

      const controller = new AbortController();
      const translatePromise = fetchTranslation(promptAnyLanguage, controller.signal);
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          controller.abort();
          resolve(null);
        }, 1000);
      });

      const result = await Promise.race([translatePromise, timeoutPromise]);

      if (result) {
        console.log("translate input", promptAnyLanguage, "translateResult", result);
        const translatedPrompt = result.translatedText;
        const translateEnd = Date.now();
        console.log(`Translation duration: ${translateEnd - translateStart}ms`);
        console.log("translated prompt to english ", promptAnyLanguage, "---", translatedPrompt);

        return translatedPrompt + "\n\n" + promptAnyLanguage;
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
  try {
    const host = await getNextTranslationServerUrl();
    const result = await fetch(`${host}/detect`, {
      method: "POST",
      body: JSON.stringify({
        q: promptAnyLanguage
      }),
      headers: { "Content-Type": "application/json" },
      signal
    });

    const resultJson = await result.json();

    return resultJson[0]?.language;
  } catch (e) {
    console.error("error fetching detection", e.message);
    return "en";
  }
}

async function fetchTranslation(promptAnyLanguage, signal) {
  try {
    const host = await getNextTranslationServerUrl();
    const result = await fetch(`${host}/translate`, {
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
  } catch (e) {
    console.error("error fetching translation", e.message);
    return null;
  }
}

// Function to sanitize a string to ensure it contains valid UTF-8 characters
export function sanitizeString(str) {
  // Encode the string as UTF-8 and decode it back to filter out invalid characters
  console.log("sanitizeString", str);
  const removedNonUtf8 = new TextDecoder().decode(new TextEncoder().encode(str));
  console.log("removedNonUtf8", removedNonUtf8);
  if (removedNonUtf8)
    return removedNonUtf8;
  return str;
}
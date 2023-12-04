
import cld from "cld";
import { detectEnglish } from './langDetect.js';
import fetch from "node-fetch";
// import {v2 } from '@google-cloud/translate';
// const Translate = v2.Translate;

// const translate = new Translate({projectId: "exalted-breaker-348215"});



// export async function translateIfNecessary(promptAnyLanguage) {
//   try {
//     const isEnglish = await detectEnglish(promptAnyLanguage);
//     // const prompt = isEnglish ? promptAnyLanguage : (await translate(promptAnyLanguage, { to: "en" }))?.text;
    
//     const prompt = isEnglish ? promptAnyLanguage : (await translate.translate(promptAnyLanguage, "en"))[0];
//     console.log("ISENGLISH", isEnglish, promptAnyLanguage);
//     if (!isEnglish) {
//       console.log("translated prompt to english ",promptAnyLanguage, "---", prompt);
//     }

//     return prompt;
//   } catch (e) {
//     return promptAnyLanguage;
//   }
// }


// use libretranslate instead of google translate

// Request:

// const res = await fetch("https://libretranslate.com/translate", {
//   method: "POST",
//   body: JSON.stringify({
//     q: "Ciao!",
//     source: "auto",
//     target: "en"
//   }),
//   headers: { "Content-Type": "application/json" }
// });

// console.log(await res.json());
// Response:

// {
//     "detectedLanguage": {
//         "confidence": 83,
//         "language": "it"
//     },
//     "translatedText": "Bye!"
// }


export async function translateIfNecessary(promptAnyLanguage) {
  try {
    const isEnglish = await detectEnglish(promptAnyLanguage);
    // const prompt = isEnglish ? promptAnyLanguage : (await translate(promptAnyLanguage, { to: "en" }))?.text;
    

    const prompt = isEnglish ? promptAnyLanguage : (await fetchTrasnlation(promptAnyLanguage)).translatedText;
    console.error("ISENGLISH", isEnglish, promptAnyLanguage);
    if (!isEnglish) {
      console.error("translated prompt to english ",promptAnyLanguage, "---", prompt);
    }

    return prompt;
  } catch (e) {
    return promptAnyLanguage;
  }
}

async function fetchTrasnlation(promptAnyLanguage) {
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

  console.error("translation result", resultJson);

  return resultJson;
}

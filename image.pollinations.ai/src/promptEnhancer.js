"use strict";
import fetch from 'node-fetch';
import urldecode from 'urldecode';
import debug from 'debug';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logError = debug('pollinations:error');
const logPimp = debug('pollinations:pimp');
const logPerf = debug('pollinations:perf');

/**
 * Main function to get and print chat completion from Pollinations Text API.
 */
async function main() {
    const chatCompletion = await memoizedPimpPrompt("dolphin octopus retro telephone", 42);
    // Print the completion returned by the API.
    process.stdout.write(chatCompletion);
}

/**
 * Function to get chat completion from Pollinations Text API.
 * If it takes longer than 5 seconds, returns the original prompt.
 * @param {string} prompt - The input prompt for the API.
 * @param {number} seed - The seed value for reproducible results.
 * @returns {Promise<string>} The chat completion response.
 */
async function pimpPromptRaw(prompt, seed) {
    try {
        prompt = urldecode(prompt);
    } catch (error) {
        logError("Error decoding prompt:", error);
        // If decoding fails, use the original prompt
    }
    let response = "";
    logPimp("pimping prompt", prompt);
    const startTime = Date.now();
    try {
        const apiUrl = `https://text.pollinations.ai/`;
        const body = JSON.stringify({
            messages: [
                {
                    role: "system",
                    content: `Instruction Set for Image Prompt Diversification:

- If the prompt is in a language other than English, translate it to English first.
- Imagine details such as setting, colors, lighting, and overall mood.
- Determine if any specific languages or cultures are particularly relevant to the subject matter of the image prompt. Consider the popularity of languages online, prioritizing more widely used words.
- Generate one distinctive new prompt that describes the same image from different perspectives while describing the same actual image. 
- Ensure that the prompts are diverse and avoid overfitting by following these guidelines:
- maintain a clear and vivid description of the image, including details about the main subject, setting, colours, lighting, and overall mood. 
- express these elements using varied vocabulary and sentence structure. Don't reuse adjectives, nouns, verbs, or even phrases.
- if a visual style or artist reference is present in the prompt, expand the prompt to contain many more details about the style or artists.
- If no visual style is given, decide on a typical style that would be used in that type of image. Be detailed and specific.
- The image generator is not very good at text and screenshots. Try and rewrite those into more conceptual prompts.
- When asked for a random prompt, generate an evocative and surprising one that fits user constraints, and provide any unspecified details.
- Dont omit any details from the originalprompt.

Respond only with the new prompt. Nothing Else.`
                },
                {
                    role: "user",
                    content: "Prompt: " + prompt
                }
            ],
            seed: seed,
            model: "openai",
            referrer: 'https://image.pollinations.ai'
        });

        // Add authentication token if available
        const headers = {
            'Content-Type': 'application/json',
            'referer': 'https://image.pollinations.ai'
        };
        
        // Use POLLINATIONS_KEY from environment if available
        if (process.env.POLLINATIONS_KEY) {
            headers['Authorization'] = `Bearer ${process.env.POLLINATIONS_KEY}`;
            logPimp("Using POLLINATIONS_KEY for authentication");
        }

        response = await Promise.race([
            fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: body
            }).then(res => {
                if (res.status !== 200) {
                    throw new Error(`Error enhancing prompt: ${res.status} - ${res.statusText}`);
                }
                return res.text();
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
        ]);
    } catch (error) {
        logError("Error:", error.message);
        logError(error.stack);
        return prompt;
    }
    const endTime = Date.now();
    logPerf(`Prompt pimping took ${endTime - startTime}ms`);
    return response + "\n\n" + prompt;
}

// Memoize the pimpPrompt function
const memoize = (fn) => {
    const cache = new Map();
    return async (arg, seed) => {
        const cacheKey = `${arg}-${seed}`;
        logPimp("cache key", cacheKey);
        if (cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }
        const result = await fn(arg, seed);
        cache.set(cacheKey, result);
        return result;
    };
};

export const pimpPrompt = memoize(pimpPromptRaw);

// main()
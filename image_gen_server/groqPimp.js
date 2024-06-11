"use strict";
// dotenv
import dotenv from "dotenv";
dotenv.config();

import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

/**
 * Main function to get and print chat completion from Groq.
 */
async function main() {
    const chatCompletion = await memoizedPimpPrompt("dolphin octopus retro telephone", 42);
    // Print the completion returned by the LLM.
    process.stdout.write(chatCompletion);
}

/**
 * Function to get chat completion from Groq.
 * Tries calling the LLM up to 3 times if it fails.
 * @param {string} prompt - The input prompt for the LLM.
 * @param {number} seed - The seed value for the random model selection.
 * @returns {Promise<string>} The chat completion response.
 */
async function pimpPromptRaw(prompt, seed) {
    const maxRetries = 3;
    let attempt = 0;
    let response = "";

    while (attempt < maxRetries) {
        try {
            response = (await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `Instruction Set for Image Prompt Diversification:

                        Receive the original image prompt from the user.
                        
                        Analyze the prompt to identify the core elements, such as the main subject, setting, colors, lighting, and overall mood.
                        
                        Determine if any specific languages or cultures are particularly relevant to the subject matter of the image prompt. Consider the popularity of languages online, prioritizing more widely used words.
                        Generate one distinctive new prompt that describes the same image from different perspectives while describing the same actual image. 
                        
                        Ensure that the prompts are diverse and avoid overfitting by following these guidelines:
                        
                        maintain a clear and vivid description of the image, including details about the main subject, setting, colours, lighting, and overall mood. 
                        
                        However, express these elements using varied vocabulary and sentence structure. Don't reuse adjectives, nouns, verbs, or even
                        
                        If a visual style or artist reference is present in the prompt, expand the prompt to contain many more details about the style or artists.
                        
                        If no visual style is given, decide on a typical style that would be used in that type of image.

                        The image generator is not very good at text and screenshots. Try and rewrite those into more figurative prompts. E.g. instead of a spreadsheet make a prompt of an intricate isometric technical drawing that somehow represents the information in the spreadsheet.

                        Example Input Prompt:
                        Image in the style of cel-shaded Japanese anime, featuring a man sitting at the side of a pool. Fish and eyeballs float around.
                        
                        Example (OUTPUT):
                        A lone figure sits by the edge of a geometric, minimalist pool, surrounded by a composition of primary-colored squares and rectangles. The fish and eyeballs are reduced to simple, abstract forms, floating in an orderly fashion. The scene is bathed in a crisp, clean light, reminiscent of Mondrian's iconic style. The air feels cool and deliberate, as if each element was carefully placed with precision. This visual homage to Bauhaus principles combines clarity and balance, presenting a tranquil, modernist dreamscape.                        
                        ---

                        Respond only with the new prompt like this:
                        [prompt] - [style / artist / medium / art movement / photo style]                        
                        `
                    },
                    {
                        role: "user",
                        content: "Input prompt: " + prompt
                    }
                ],
                model: randomModel()
            })).choices[0]?.message?.content || "";
            break; // Exit loop if successful
        } catch (error) {
            attempt++;
            if (attempt >= maxRetries) {
                console.error(`Failed to get chat completion after ${maxRetries} attempts`);
                return prompt;
            }
        }
    }

    return response + "\n\n" + prompt;
}

// Memoize the pimpPrompt function
const memoize = (fn) => {
    const cache = new Map();
    return async (arg, seed) => {
        const cacheKey = `${arg}-${seed}`;
        console.log("cache key", cacheKey);
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

const randomModel = () => {
    const models = ["gemma-7b-it", "llama3-8b-8192", "mixtral-8x7b-32768", "llama3-70b-8192", "mixtral-8x7b-32768"];
    const randomIndex = Math.floor(Math.random() * models.length);
    return models[randomIndex];
}

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
 * Tries calling the LLM up to 2 times if it fails.
 * If it takes longer than 2 seconds, returns the original prompt.
 * @param {string} prompt - The input prompt for the LLM.
 * @param {number} seed - The seed value for the random model selection.
 * @returns {Promise<string>} The chat completion response.
 */
async function pimpPromptRaw(prompt, seed) {
    const maxRetries = 2;
    let attempt = 0;
    let response = "";
    console.log("pimping prompt", prompt)
    while (attempt < maxRetries) {
        try {
            response = await Promise.race([
                groq.chat.completions.create({
                    messages: [
                        {
                            role: "system",
                            content: `Instruction Set for Image Prompt Diversification:

                            If the prompt is in a language other than English, translate it to English first.
                            
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

                            When asked for a random prompt, generate an evocative and surprising one that fits user constraints, and provide any unspecified details.

                            Respond only with the new prompt. Nothing El:
                            [prompt] - [style / artist / medium / art movement / photo style]                        
                            `
                        },
                        {
                            role: "user",
                            content: "Input prompt: " + prompt
                        }
                    ],
                    model: randomModel()
                }).then(result => result.choices[0]?.message?.content || ""),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
            ]);
            break; // Exit loop if successful
        } catch (error) {
            attempt++;
            if (attempt >= maxRetries) {
                console.error(`Failed to get chat completion after ${maxRetries} attempts`);
                return prompt;
            }
            if (error.message === "Timeout") {
                console.error("Request timed out");
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
    const models = ["gemma2-9b-it", "gemma-7b-it",
        "llama3-8b-8192", "llama3-groq-70b-8192-tool-use-preview", "llama3-groq-8b-8192-tool-use-preview", "llama3-70b-8192", "llama-3.1-70b-versatile", "llama-3.1-8b-instant",
        "mixtral-8x7b-32768"];
    const randomIndex = Math.floor(Math.random() * models.length);
    return models[randomIndex];
}

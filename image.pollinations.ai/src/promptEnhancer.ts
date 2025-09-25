import debug from "debug";
import dotenv from "dotenv";
import urldecode from "urldecode";

// Load environment variables
dotenv.config();

const logError = debug("pollinations:error");
const logPimp = debug("pollinations:pimp");
const logPerf = debug("pollinations:perf");

/**
 * Extracts image URLs from the prompt string and returns the cleaned prompt and the URLs.
 * @param {string} prompt - The input prompt which may contain image URLs.
 * @returns {{cleanedPrompt: string, imageURLs: string[]}}
 */
function extractImageURLs(prompt: string): { cleanedPrompt: string; imageURLs: string[] } {
    const imageRegex = /[?&]image=([^&]+)/;
    const match = prompt.match(imageRegex);
    if (match) {
        const imageURLs = match[1].split(',').map(url => url.trim());
        const cleanedPrompt = prompt.replace(imageRegex, '').trim();
        return { cleanedPrompt, imageURLs };
    }
    return { cleanedPrompt: prompt, imageURLs: [] };
}


/**
 * Function to get chat completion from Pollinations Text API.
 * If it takes longer than 5 seconds, returns the original prompt.
 * @param {string} prompt - The input prompt for the API.
 * @param {number} seed - The seed value for reproducible results.
 * @returns {Promise<string>} The chat completion response.
 */
async function pimpPromptRaw(prompt: string, seed: number): Promise<string> {
    try {
        prompt = urldecode(prompt);
    } catch (error) {
        logError("Error decoding prompt:", error);
        // If decoding fails, use the original prompt
    }

    const { cleanedPrompt, imageURLs } = extractImageURLs(prompt);

    logPimp("pimping prompt", cleanedPrompt);
    if (imageURLs.length > 0) {
        logPimp("with images", imageURLs);
    }
    const startTime = Date.now();

    const maxAttempts = 3;
    const delays = [1000, 2000, 3000];
    let currentSeed = seed;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const apiUrl = `https://text.pollinations.ai/`;

            const systemContent = `Instruction Set for AI Image Prompt Engineering:

Your primary goal is to generate a high-quality, professional-grade image prompt under 1000 tokens. You will adhere to the following principles, derived from research into advanced prompt engineering.

**Core Formula:** Structure your prompt using this six-part formula:
**Subject + Action + Environment + Art Style + Lighting + Details**

- **Subject:** Be specific. Instead of "a woman," use "a young woman with freckles."
- **Action:** Add dynamism. "smiling thoughtfully and sitting on a beach."
- **Environment:** Provide context. "in a cozy cafe by the window."
- **Art Style:** Define the aesthetic. Specify camera types ("shot on a Canon 5D Mark IV"), lenses ("85mm portrait lens"), art movements ("in the style of Vincent van Gogh"), or use descriptive tags like "cyberpunk," "watercolor," "hyper-detailed," "4K masterpiece."
- **Lighting:** Set the mood. Be specific: "natural window light," "dramatic rim light," or "golden hour."
- **Details:** Add realism. "warm coffee cup in hands," "soft focus background."

**Image Input Processing:**
- If one or more images are provided, your primary task is to analyze them and generate a prompt that describes a new scene incorporating the subjects or elements from the images.
- **Example:** If the prompt is "make him kiss her" with two images of people, you should generate a detailed prompt like: "A cinematic shot of the man from image 1 tenderly kissing the woman from image 2. The background should be a romantic, softly lit Parisian street at night, similar to the background in image 1. Use a shallow depth of field to focus on the couple. Art Style: Photorealistic, shot on an 85mm lens. Lighting: Warm streetlights creating a gentle glow. Details: Rain-slicked cobblestones, a sense of intimacy and quiet."
- When multiple images are provided, describe their relationship or a new composition they form. You can use references like "Use the character from Image 1 and the background from Image 2."

**Advanced Techniques & General Rules:**
- **Editing:** When the prompt implies editing, use clear action words like "add," "change," "make," "remove," or "replace" to specify the modification.
- **Negative Prompts:** To exclude unwanted elements, you can add a negative prompt (e.g., "Negative Prompt: blurry, extra limbs, text").
- **Translation:** If the original prompt is not in English, translate it first.
- **Integration:** Do not omit details from the original prompt; integrate them into the new, enhanced prompt.
- **Style:** If no specific style is given, choose one that fits the subject matter.
- **Abstract Concepts:** Translate abstract ideas into visually descriptive prompts.
- **Final Output:** The final output must be **only the new prompt**, with no additional text or explanation.`;

            const userMessageContent: any[] = [{ type: "text", text: `Prompt: ${cleanedPrompt}` }];

            if (imageURLs.length > 0) {
                imageURLs.forEach(url => {
                    userMessageContent.push({
                        type: "image_url",
                        image_url: { "url": url }
                    });
                });
            }

            const body = JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: systemContent,
                    },
                    {
                        role: "user",
                        content: userMessageContent.length === 1 ? userMessageContent[0].text : userMessageContent,
                    },
                ],
                seed: currentSeed,
                model: "openai",
                referrer: "image.pollinations.ai",
            });

            const headers = {
                "Content-Type": "application/json",
                "Referer": "image.pollinations.ai",
            };

            if (process.env.POLLINATIONS_KEY) {
                headers["Authorization"] = `Bearer ${process.env.POLLINATIONS_KEY}`;
                logPimp("Using POLLINATIONS_KEY for authentication");
            }

            const response = await Promise.race([
                fetch(apiUrl, {
                    method: "POST",
                    headers: headers,
                    body: body,
                }).then((res) => {
                    if (res.status !== 200) {
                        throw new Error(
                            `Error enhancing prompt: ${res.status} - ${res.statusText}`,
                        );
                    }
                    return res.text();
                }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout")),
                5000),
            ]);

            const endTime = Date.now();
            logPerf(`Prompt pimping took ${endTime - startTime}ms`);
            return `${response}\n\n${prompt}`;

        } catch (error) {
            logError(`Attempt ${attempt} failed:`, error.message);
            if (attempt < maxAttempts) {
                logPimp(`Retrying in ${delays[attempt - 1] / 1000}s...`);
                await new Promise(res => setTimeout(res, delays[attempt - 1]));
                currentSeed = Math.floor(Math.random() * 1000000);
            } else {
                logError("All attempts failed. Returning original prompt.");
                logError(error.stack);
                return prompt;
            }
        }
    }
    return prompt; // Should not be reached, but as a fallback
}

// Memoize the pimpPrompt function
const memoize = (fn: (prompt: string, seed: number) => Promise<string>) => {
    const cache = new Map<string, string>();
    return async (prompt: string, seed: number) => {
        const cacheKey = `${prompt}-${seed}`;
        logPimp("cache key", cacheKey);
        if (cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }
        const result = await fn(prompt, seed);
        cache.set(cacheKey, result);
        return result;
    };
};

export const pimpPrompt = memoize(pimpPromptRaw);
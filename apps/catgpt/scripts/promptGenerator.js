

import { CATGPT_STYLE, CATGPT_PERSONALITY } from "./config.js";
export function createImageGenerationPrompt(userQuestion) {
    return `${CATGPT_STYLE}\n
    ${CATGPT_PERSONALITY}\n
    IMPORTANT: CatGPT's response MUST be 2-5 words ONLY. Make it funny, sarcastic, and dismissive. Examples: "Not your problem.", "I"d rather nap.", "Hard pass, human."\n
    Human asks: "${userQuestion}"\n
    CatGPT responds (2-5 words, funny):`;
}

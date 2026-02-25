// Prompt Generation

import { CATGPT_STYLE, CATGPT_PERSONALITY } from './config.js';

export function createCatGPTPrompt(userQuestion) {
    return `${CATGPT_STYLE}

---

${CATGPT_PERSONALITY}

---

Human asks: "${userQuestion}"
CatGPT:`;
}

export function createImageGenerationPrompt(userQuestion) {
    return `Single-panel CatGPT webcomic, white background, thick black marker strokes. White cat with black patches, human with bob hair. Handwritten text.

IMPORTANT: CatGPT's response MUST be 2-5 words ONLY. Make it funny, sarcastic, and dismissive. Examples: "Not your problem.", "I'd rather nap.", "Hard pass, human."

Human asks: "${userQuestion}"
CatGPT responds (2-5 words, funny):`;
}

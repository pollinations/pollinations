/**
 * Writing Guidelines for GEN COPY Pipeline
 * Pure content - no logic, just prompt templates and guidelines
 *
 * Logic functions are in helpers/writing-helpers.ts
 */

// ==============================================
// BASE WRITING GUIDELINES
// ==============================================

export const WRITING_GUIDELINES = `You are writing copy for pollinations.ai, an open-source generative AI platform from Berlin.

Writing Style:
- Clear, friendly, and professional tone
- Use active voice and direct language
- Keep sentences short and impactful
- Be genuine and avoid corporate speak

Output Requirements:
- Plain text only, no markdown formatting
- No section headers or titles
- No bullet points unless explicitly needed
- Natural, conversational flow

Technical Content:
- Be accurate and specific
- Use concrete examples
- Explain complex concepts simply
- Focus on practical value`;

// ==============================================
// TRANSLATION PROMPTS
// ==============================================

export const TRANSLATE_PROMPT =
    "Translate this text to the user's language if it's not already in that language.";

export const translateToPrompt = (language: string): string =>
    language.startsWith("en") ? "" : `Translate the output to: ${language}`;

// ==============================================
// RESPONSIVE PROMPTS
// ==============================================

export const RESPONSIVE_MOBILE_PROMPT =
    "Keep it very short (5-15 words maximum). Mobile users need quick, scannable content.";

export const RESPONSIVE_DESKTOP_PROMPT =
    "Keep it concise but informative (1-3 sentences).";

// ==============================================
// MODIFIER PROMPTS
// ==============================================

export const brevityPrompt = (maxWords: number): string =>
    `Keep under ${maxWords} words. Be concise and impactful.`;

export const CTA_PROMPT =
    "Make this a strong call-to-action. Use action verbs and create urgency.";

export const NO_LINKS_PROMPT =
    "Do not include any URLs or links in the output.";

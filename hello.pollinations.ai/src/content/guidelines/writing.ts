/**
 * Writing Guidelines for GEN COPY Pipeline
 * Base guidelines + optional prompt modifiers for text generation
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
// OPTIONAL PROMPT MODIFIERS
// ==============================================

export type TransformFn = (context?: any) => string | null;

/**
 * Translate text to user's language
 */
export function translate(): TransformFn {
    return () =>
        "Translate this text to the user's language if it's not already in that language.";
}

/**
 * Make text responsive to device (mobile vs desktop)
 */
export function responsive(): TransformFn {
    return (context?: any) => {
        const isMobile = context?.isMobile;
        if (isMobile) {
            return "Keep it very short (5-15 words maximum). Mobile users need quick, scannable content.";
        }
        return "Keep it concise but informative (1-3 sentences).";
    };
}

/**
 * Translate to specific language
 */
export function translateTo(language: string): TransformFn {
    return () =>
        language.startsWith("en") ? "" : `Translate the output to: ${language}`;
}

/**
 * Limit text to a specific word count
 */
export function brevity(maxWords: number): TransformFn {
    return () => `Keep under ${maxWords} words. Be concise and impactful.`;
}

/**
 * Emphasize call-to-action
 */
export function cta(): TransformFn {
    return () =>
        "Make this a strong call-to-action. Use action verbs and create urgency.";
}

/**
 * Remove any links from the text
 */
export function noLinks(): TransformFn {
    return () => "Do not include any URLs or links in the output.";
}

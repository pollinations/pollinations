/**
 * Writing Helper Functions for GEN COPY Pipeline
 * Pure logic - functions that use the prompts from writing-prompts.ts
 */

import {
    TRANSLATE_PROMPT,
    translateToPrompt,
    RESPONSIVE_MOBILE_PROMPT,
    RESPONSIVE_DESKTOP_PROMPT,
    brevityPrompt,
    CTA_PROMPT,
    NO_LINKS_PROMPT,
} from "../writing";

// ==============================================
// TYPE DEFINITIONS
// ==============================================

export type TransformFn = (context?: any) => string | null;

// ==============================================
// TRANSFORM FUNCTIONS
// ==============================================

/**
 * Translate text to user's language
 */
export function translate(): TransformFn {
    return () => TRANSLATE_PROMPT;
}

/**
 * Make text responsive to device (mobile vs desktop)
 */
export function responsive(): TransformFn {
    return (context?: any) => {
        const isMobile = context?.isMobile;
        if (isMobile) {
            return RESPONSIVE_MOBILE_PROMPT;
        }
        return RESPONSIVE_DESKTOP_PROMPT;
    };
}

/**
 * Translate to specific language
 */
export function translateTo(language: string): TransformFn {
    return () => translateToPrompt(language);
}

/**
 * Limit text to a specific word count
 */
export function brevity(maxWords: number): TransformFn {
    return () => brevityPrompt(maxWords);
}

/**
 * Emphasize call-to-action
 */
export function cta(): TransformFn {
    return () => CTA_PROMPT;
}

/**
 * Remove any links from the text
 */
export function noLinks(): TransformFn {
    return () => NO_LINKS_PROMPT;
}

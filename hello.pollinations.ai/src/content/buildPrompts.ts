/**
 * PROMPT ASSEMBLER
 * Central system for combining guidelines + inputs → full prompts
 * Implements prompt assembly for COPY, STYLE, and LOGO pipelines
 */

import { STYLING_GUIDELINES } from "./guidelines-styling";
import { DRAWING_GUIDELINES } from "./guidelines-drawing";
import { generateThemeCopy, type PageCopy, type ThemeCopy } from "./guideline-helpers/writing-helpers";

// Import copy files
import { HELLO_PAGE } from "./copy/hello";
import { APPS_PAGE } from "./copy/apps";
import { DOCS_PAGE } from "./copy/docs";
import { COMMUNITY_PAGE } from "./copy/community";
import { PLAY_PAGE } from "./copy/play";

// Re-export types for convenience
export type { PageCopy, ThemeCopy };

/**
 * Wrapper for GEN COPY Pipeline
 * Prepares page copy objects and delegates to writing-helpers
 */
export async function generateThemeCopyWithDefaults(
    themeVibe: string,
    isMobile: boolean,
    targetLanguage = "en",
    signal?: AbortSignal,
): Promise<ThemeCopy> {
    const pageCopyObjects = {
        HELLO_PAGE,
        APPS_PAGE,
        DOCS_PAGE,
        COMMUNITY_PAGE,
        PLAY_PAGE,
    };

    return generateThemeCopy(
        themeVibe,
        isMobile,
        pageCopyObjects,
        targetLanguage,
        signal
    );
}

// Re-export for convenience
export { generateThemeCopy };

// ==============================================
// PROMPT ASSEMBLY FUNCTIONS
// ==============================================

/**
 * GEN STYLE Pipeline
 * Assembles prompts for theme styling generation
 */
export function assembleStylePrompt(themeDescription: string): string {
    return `${STYLING_GUIDELINES}

Theme Description:
${themeDescription}

Generate the complete design tokens in JSON format:`;
}

/**
 * GEN SUPPORTER LOGO Pipeline
 * Assembles prompts for supporter logo image generation
 */
export function assembleLogoPrompt(
    supporterInfo: string,
    themeDescription: string,
): string {
    return `${DRAWING_GUIDELINES}

Theme Context:
${themeDescription}

Supporter Information:
${supporterInfo}

Describe a logo design that matches this theme and supporter:`;
}

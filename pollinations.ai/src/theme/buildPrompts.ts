/**
 * PROMPT ASSEMBLER
 * Central system for combining guidelines + inputs → full prompts
 * Pure assembly - no API calls, only string building
 * Implements prompt assembly for COPY, STYLE, and LOGO pipelines
 */

import { STYLING_GUIDELINES } from "./guidelines/designer";
import { DRAWING_GUIDELINES } from "./guidelines/illustrator";
import { WRITING_GUIDELINES } from "./guidelines/copywriter";
import type { ThemeCopy } from "./guidelines/helpers/copywriter";

// Re-export types for convenience
export type { ThemeCopy };

// ==============================================
// PROMPT ASSEMBLY FUNCTIONS
// Pure functions that combine guidelines + data → prompt strings
// No API calls - caller is responsible for sending to AI
// ==============================================

/**
 * GEN COPY Pipeline
 * Assembles prompts for copy generation based on theme
 */
export function assembleCopyPrompt(
    themeVibe: string,
    jobs: Array<{ id: string; text: string; limit: number }>,
    targetLanguage = "en",
): string {
    return `${WRITING_GUIDELINES}

RUNTIME CONTEXT:
- THEME_VIBE: "${themeVibe}"
- TARGET_LANGUAGE: "${targetLanguage}"

INPUT JSON:
${JSON.stringify(jobs, null, 2)}

Generate the JSON Object now:`;
}

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

/**
 * PROMPT ASSEMBLER
 * Central system for combining guidelines + inputs → full prompts
 * Pure assembly - no API calls, only string building
 * Implements prompt assembly for STYLE and LOGO pipelines
 * Note: Copy/translation has been moved to /src/copy/
 */

import { STYLING_GUIDELINES } from "./guidelines/designer";
import { DRAWING_GUIDELINES } from "./guidelines/illustrator";

// ==============================================
// PROMPT ASSEMBLY FUNCTIONS
// Pure functions that combine guidelines + data → prompt strings
// No API calls - caller is responsible for sending to AI
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

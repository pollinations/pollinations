/**
 * PROMPT ASSEMBLER
 * Central system for combining guidelines + inputs → full prompts
 * Pure assembly - no API calls, only string building
 * Note: Copy/translation has been moved to /src/copy/
 */

import { STYLING_GUIDELINES } from "./guidelines/designer";

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

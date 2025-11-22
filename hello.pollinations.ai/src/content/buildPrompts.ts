/**
 * PROMPT ASSEMBLER
 * Central system for combining guidelines + inputs → full prompts
 * Implements the three main pipelines: GEN COPY, GEN STYLE, GEN SUPPORTER LOGO
 */

import { WRITING_GUIDELINES } from "./guidelines/writing";
import { responsive, translateTo } from "./guidelines/helpers/writing-helpers";
import { STYLING_GUIDELINES } from "./guidelines/styling";
import { DRAWING_GUIDELINES } from "./guidelines/drawing";

/**
 * GEN COPY Pipeline
 * Assembles prompts for text/copy generation
 */
export function assembleCopyPrompt(
    websiteInfo: string,
    targetDuration: "mobile" | "desktop",
    targetLanguage: string,
): string {
    // Pure logic - get transforms from writing guidelines
    const durationTransform = responsive()({
        isMobile: targetDuration === "mobile",
    });
    const languageTransform = translateTo(targetLanguage)();

    const modifiers = [durationTransform, languageTransform]
        .filter(Boolean)
        .join("\n");

    return `${WRITING_GUIDELINES}

${modifiers}

Website Content to Transform:
${websiteInfo}

Generate the text copy now:`;
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

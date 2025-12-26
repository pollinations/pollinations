/**
 * Drawing Helper Functions for GEN SUPPORTER LOGO Pipeline
 * Pure logic - logo generation function
 */

import { generateImage } from "../../../services/pollinationsAPI";
import { assembleLogoPrompt } from "../../buildPrompts";
import { THEME_CONFIG } from "../../config";

// ==============================================
// TYPE DEFINITIONS
// ==============================================

export interface SupporterLogoOptions {
    supporterInfo: string;
    themeDescription: string;
    width?: number;
    height?: number;
    seed?: number;
}

// ==============================================
// LOGO GENERATION HELPER
// ==============================================

/**
 * Generate a supporter logo using drawing guidelines
 */
export async function generateSupporterLogo(
    options: SupporterLogoOptions,
): Promise<string> {
    const {
        supporterInfo,
        themeDescription,
        width = 128,
        height = 128,
        seed = Math.floor(Math.random() * THEME_CONFIG.maxSeed) + 1,
    } = options;

    // Assemble the prompt using the drawing guidelines
    const prompt = assembleLogoPrompt(supporterInfo, themeDescription);

    // Generate the logo image
    const logoUrl = await generateImage(prompt, {
        width,
        height,
        seed,
        model: THEME_CONFIG.models.illustrator,
        nologo: true,
    });

    return logoUrl;
}

/**
 * Drawing Helper Functions for GEN SUPPORTER LOGO Pipeline
 * Pure logic - logo generation function
 */

import { assembleLogoPrompt } from "../../buildPrompts";
import { generateImage } from "../../../services/pollinationsAPI";
import { API_KEY } from "../../../api.config";
import { THEME_MODELS } from "../../models";

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
    signal?: AbortSignal,
): Promise<string> {
    const {
        supporterInfo,
        themeDescription,
        width = 128,
        height = 128,
        seed = 42,
    } = options;

    // Assemble the prompt using the drawing guidelines
    const prompt = assembleLogoPrompt(supporterInfo, themeDescription);

    // Generate the logo image
    const logoUrl = await generateImage(
        prompt,
        API_KEY,
        {
            width,
            height,
            seed,
            model: THEME_MODELS.illustrator,
            nologo: true,
        },
        signal,
    );

    return logoUrl;
}

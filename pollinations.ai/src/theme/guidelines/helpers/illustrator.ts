/**
 * Drawing Helper Functions for GEN SUPPORTER LOGO Pipeline
 */

import { generateImage } from "../../../services/pollinationsAPI";
import { assembleLogoPrompt } from "../../buildPrompts";

export interface SupporterLogoOptions {
    supporterInfo: string;
    themeDescription: string;
    width?: number;
    height?: number;
    seed?: number;
}

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
        seed = 1,
    } = options;

    const prompt = assembleLogoPrompt(supporterInfo, themeDescription);

    return generateImage(prompt, {
        width,
        height,
        seed,
        model: "zimage",
    });
}

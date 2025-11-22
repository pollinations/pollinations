/**
 * Drawing Guidelines for GEN SUPPORTER LOGO Pipeline
 * Base guidelines + logo generation helper
 */

import { assembleLogoPrompt } from "../buildPrompts";
import { generateImage } from "../../services/pollinationsAPI";

// ==============================================
// BASE DRAWING GUIDELINES
// ==============================================

export const DRAWING_GUIDELINES = `Generate a supporter/sponsor logo that matches the website theme.

Design Requirements:
- Simple, iconic design
- Works well at small sizes (32x32px to 128x128px)
- Clear silhouette and recognizable shape
- Professional and polished appearance

Theme Integration:
- Matches the overall theme personality and mood
- Complements the color scheme
- Reflects the theme's visual style

Technical Specs:
- SVG-friendly shapes (geometric, clean lines)
- Good contrast against backgrounds
- Scalable without detail loss
- Works in monochrome if needed

Style Guidelines:
- Modern and timeless, not trendy
- Abstract or symbolic, not literal
- Balanced composition
- Memorable and distinctive`;

// ==============================================
// LOGO GENERATION HELPER
// ==============================================

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
        {
            width,
            height,
            seed,
            model: "flux",
            nologo: true,
        },
        signal,
    );

    return logoUrl;
}

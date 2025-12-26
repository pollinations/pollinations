/**
 * Background Generation Helper Functions
 * Combines prompt assembly + API calls for background generation
 */

import { generateText } from "../../../services/pollinationsAPI";
import { THEME_CONFIG } from "../../config";
import { BACKGROUND_GUIDELINES } from "../animator";

export async function generateBackground(
    themePrompt: string,
    signal?: AbortSignal,
): Promise<string> {
    const fullPrompt = BACKGROUND_GUIDELINES.replace(
        "{THEME_PROMPT}",
        themePrompt,
    );

    console.log(
        `🎬 [ANIMATOR] → Generating WebGL background... (model: ${THEME_CONFIG.models.animator})`,
    );
    const html = await generateText(
        fullPrompt,
        Math.floor(Math.random() * THEME_CONFIG.maxSeed) + 1,
        THEME_CONFIG.models.animator,
        signal,
    );

    // Clean up markdown code blocks if present
    let cleanHtml = html.trim();
    cleanHtml = cleanHtml.replace(/^```html?\n?/i, "");
    cleanHtml = cleanHtml.replace(/\n?```$/, "");

    console.log("🎬 [ANIMATOR] ← Background HTML received");
    return cleanHtml;
}

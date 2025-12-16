/**
 * Background Generation Helper Functions
 * Combines prompt assembly + API calls for background generation
 */

import { BACKGROUND_GUIDELINES } from "../animator";
import { generateText } from "../../../services/pollinationsAPI";
import { API_KEY } from "../../../api.config";
import { THEME_MODELS } from "../../models";

export async function generateBackground(
    themePrompt: string,
    signal?: AbortSignal,
): Promise<string> {
    const fullPrompt = BACKGROUND_GUIDELINES.replace(
        "{THEME_PROMPT}",
        themePrompt,
    );

    console.log(
        `🎬 [ANIMATOR] → Generating WebGL background... (model: ${THEME_MODELS.animator})`,
    );
    const html = await generateText(
        fullPrompt,
        API_KEY,
        42,
        THEME_MODELS.animator,
        signal,
    );

    // Clean up markdown code blocks if present
    let cleanHtml = html.trim();
    cleanHtml = cleanHtml.replace(/^```html?\n?/i, "");
    cleanHtml = cleanHtml.replace(/\n?```$/, "");

    console.log("🎬 [ANIMATOR] ← Background HTML received");
    return cleanHtml;
}

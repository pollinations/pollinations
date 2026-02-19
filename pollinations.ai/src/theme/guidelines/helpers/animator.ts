/**
 * Background Generation Helper Functions
 */

import { generateText } from "../../../services/pollinationsAPI";
import { BACKGROUND_GUIDELINES } from "../animator";

export async function generateBackground(
    themePrompt: string,
    apiKey?: string,
    model?: string,
): Promise<string> {
    const fullPrompt = BACKGROUND_GUIDELINES.replace(
        "{THEME_PROMPT}",
        themePrompt,
    );

    console.log("🎬 [ANIMATOR] → Generating WebGL background...");
    const html = await generateText(fullPrompt, undefined, model, apiKey);

    // Clean up markdown code blocks if present
    let cleanHtml = html.trim();
    cleanHtml = cleanHtml.replace(/^```html?\n?/i, "");
    cleanHtml = cleanHtml.replace(/\n?```$/, "");

    console.log("🎬 [ANIMATOR] ← Background HTML received");
    return cleanHtml;
}

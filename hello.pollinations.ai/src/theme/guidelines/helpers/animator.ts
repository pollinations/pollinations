/**
 * Background Generation Helper Functions
 * Combines prompt assembly + API calls for background generation
 */

import { BACKGROUND_GUIDELINES } from "../background";
import { generateText } from "../../../services/pollinationsAPI";

const MODEL = "gemini-large";

export async function generateBackground(
    themePrompt: string,
    signal?: AbortSignal,
): Promise<string> {
    const fullPrompt = BACKGROUND_GUIDELINES.replace(
        "{THEME_PROMPT}",
        themePrompt,
    );

    console.log("🎨 [BACKGROUND PROMPT]:", fullPrompt);
    const html = await generateText(fullPrompt, 42, MODEL, signal);

    // Clean up markdown code blocks if present
    let cleanHtml = html.trim();
    cleanHtml = cleanHtml.replace(/^```html?\n?/i, "");
    cleanHtml = cleanHtml.replace(/\n?```$/, "");

    console.log("🎨 [BACKGROUND GENERATED]");
    return cleanHtml;
}

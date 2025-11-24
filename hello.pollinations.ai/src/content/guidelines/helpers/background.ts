/**
 * Background Generation Helper Functions
 * Combines prompt assembly + API calls for background generation
 */

import { BACKGROUND_GUIDELINES } from "../background";
import { generateText } from "../../../services/pollinationsAPI";

export async function generateBackground(
    themePrompt: string,
    signal?: AbortSignal,
): Promise<string> {
    const fullPrompt = BACKGROUND_GUIDELINES.replace(
        "{THEME_PROMPT}",
        themePrompt,
    );

    console.log("🎨 [BACKGROUND PROMPT]:", fullPrompt);
    // Using openai-large as requested (Gemini Large equivalent in this context)
    const html = await generateText(fullPrompt, 42, "openai-large", signal);

    // Clean up markdown code blocks if present
    let cleanHtml = html.trim();
    cleanHtml = cleanHtml.replace(/^```html?\n?/i, "");
    cleanHtml = cleanHtml.replace(/\n?```$/, "");

    console.log("🎨 [BACKGROUND GENERATED]");
    return cleanHtml;
}

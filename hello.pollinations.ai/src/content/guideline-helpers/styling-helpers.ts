/**
 * Styling Helper Functions for GEN STYLE Pipeline
 * Pure logic - parsing, validation, and theme generation functions
 */

import { ThemeDictionary, themeToDictionary } from "../theme/engine";
import { assembleStylePrompt } from "../buildPrompts";
import { generateText } from "../../services/pollinationsAPI";
import { STYLING_GUIDELINES } from "../guidelines-styling";
import type { MacroConfig } from "../theme/macros";
import { macrosToTheme } from "../theme/macros-engine";

// ==============================================
// TYPE DEFINITIONS
// ==============================================

// New full theme format
export interface FullThemeStyle {
    colors: ThemeDictionary["colors"];
    borderRadius?: Record<string, string>;
    fonts?: {
        title: string;
        headline: string;
        body: string;
    };
    spacing?: {
        xs: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
        "2xl": string;
    };
}

// ==============================================
// JSON PARSING HELPERS
// ==============================================

/**
 * Parse and validate LLM response into ThemeDictionary (colors + borderRadius)
 */
export function parseThemeResponse(text: string): ThemeDictionary {
    let jsonText = text.trim();
    jsonText = jsonText.replace(/^```json?\n?/i, "");
    jsonText = jsonText.replace(/\n?```$/, "");
    jsonText = jsonText.trim();

    const parsed = JSON.parse(jsonText);

    if (typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid theme structure: expected object");
    }

    // Check if it's a MacroConfig (has 'text', 'surfaces', 'buttons' etc.)
    if (parsed.text && parsed.surfaces && parsed.buttons) {
        // It's a MacroConfig!
        const macroConfig = parsed as MacroConfig;
        const llmTheme = macrosToTheme(macroConfig);
        return themeToDictionary(llmTheme);
    }

    // Fallback: Handle old format (slots) or raw dictionary
    // This is kept for backward compatibility if we ever feed old prompts or have legacy data
    let convertedColors: Record<string, any> = {};

    // Handle new full theme format with colors.slots
    const slots = parsed.colors?.slots || parsed.slots;

    if (slots) {
        Object.values(slots).forEach((slot: any) => {
            const hex = slot.hex;
            const ids = slot.ids || slot.paths || [];
            if (!convertedColors[hex]) {
                convertedColors[hex] = [];
            }
            // Ensure ids is an array before spreading
            const idsArray = Array.isArray(ids) ? ids : [ids];
            convertedColors[hex].push(...idsArray);
        });
    } else {
        convertedColors = parsed as Record<string, any>;
    }

    return {
        colors: convertedColors,
        borderRadius: parsed.borderRadius,
        fonts: parsed.fonts,
    };
}

/**
 * Parse full theme response (colors + fonts + spacing)
 */
export function parseFullThemeResponse(text: string): FullThemeStyle {
    // For now, we reuse parseThemeResponse which handles the heavy lifting
    // The MacroConfig response doesn't explicitly return "spacing" in the same way the old one might have
    // But our new prompt asks for MacroConfig which maps to tokens.
    // The old FullThemeStyle interface expects 'spacing'.
    // The new prompt DOES NOT ask for spacing in the JSON schema I wrote in styling.ts?
    // Wait, I removed spacing from the JSON schema in styling.ts!
    // So 'spacing' will be undefined. That's fine for now as it's optional.

    const themeDictionary = parseThemeResponse(text);

    return {
        colors: themeDictionary.colors,
        borderRadius: themeDictionary.borderRadius,
        fonts: themeDictionary.fonts as any, // Cast to match expected structure if needed
        spacing: undefined, // We dropped spacing from the macro prompt for now
    };
}

// ==============================================
// THEME GENERATION HELPERS
// ==============================================

/**
 * Generate theme (colors + borderRadius)
 */
export async function generateTheme(
    userPrompt: string,
    signal?: AbortSignal,
): Promise<ThemeDictionary> {
    const fullPrompt = `${STYLING_GUIDELINES}

USER REQUEST:
${userPrompt}

Generate the theme JSON now:`;

    console.log("🎨 [THEME PROMPT]:", fullPrompt);
    const text = await generateText(fullPrompt, 42, "openai-fast", signal);
    console.log("🎨 [THEME RESPONSE]:", text);
    return parseThemeResponse(text);
}

/**
 * Generate full theme style (colors + fonts + spacing)
 * Uses the GEN STYLE pipeline with styling guidelines
 */
export async function generateFullTheme(
    themeDescription: string,
    signal?: AbortSignal,
): Promise<FullThemeStyle> {
    const fullPrompt = assembleStylePrompt(themeDescription);
    console.log("🎨 [THEME PROMPT]:", fullPrompt);
    const text = await generateText(fullPrompt, 42, "openai-large", signal);
    console.log("🎨 [THEME RESPONSE]:", text);
    return parseFullThemeResponse(text);
}

// ==============================================
// COPY GENERATION HELPERS
// ==============================================

// Copy types moved to buildPrompts.ts

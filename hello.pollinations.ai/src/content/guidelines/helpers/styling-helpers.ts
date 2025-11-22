/**
 * Styling Helper Functions for GEN STYLE Pipeline
 * Pure logic - parsing, validation, and theme generation functions
 */

import type { TokenId } from "../../theme/tokens";
import type { ThemeDictionary } from "../../theme/engine";
import { assembleStylePrompt } from "../../buildPrompts";
import { generateText } from "../../../services/pollinationsAPI";
import { STYLING_GUIDELINES } from "../styling";

// ==============================================
// TYPE DEFINITIONS
// ==============================================

// Legacy format for colors (backwards compatibility)
export type ThemeDefinition = Record<string, TokenId[]>;

// New full theme format
export interface FullThemeStyle {
    colors: ThemeDefinition;
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

    // Convert new format (with slots) to dictionary format
    let convertedColors: ThemeDefinition = {};

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
        convertedColors = parsed as ThemeDefinition;
    }

    return {
        colors: convertedColors,
        borderRadius: parsed.borderRadius,
    };
}

/**
 * Parse full theme response (colors + fonts + spacing)
 */
export function parseFullThemeResponse(text: string): FullThemeStyle {
    let jsonText = text.trim();
    jsonText = jsonText.replace(/^```json?\n?/i, "");
    jsonText = jsonText.replace(/\n?```$/, "");
    jsonText = jsonText.trim();

    const parsed = JSON.parse(jsonText);

    // If it's the old color-only format, wrap it
    if (!parsed.colors && !parsed.fonts && !parsed.spacing) {
        const themeDictionary = parseThemeResponse(text);
        return {
            colors: themeDictionary.colors,
            borderRadius: themeDictionary.borderRadius,
        };
    }

    return parsed as FullThemeStyle;
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
    const text = await generateText(fullPrompt, 42, "openai-large", signal);
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

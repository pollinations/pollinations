/**
 * Styling Helper Functions for GEN STYLE Pipeline
 * Pure logic - parsing, validation, and theme generation functions
 */

import { generateText } from "../../../services/pollinationsAPI";
import type { MacroConfig } from "../../style/simplified-config.types";
import { macrosToTheme } from "../../style/simplified-to-theme";
import {
    type ThemeDictionary,
    themeToDictionary,
} from "../../style/theme-processor";
import { STYLING_GUIDELINES } from "../designer";

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
    const slots = parsed.colors?.slots || parsed.slots;

    if (slots) {
        // biome-ignore lint/suspicious/noExplicitAny: Legacy theme format handling
        const normalizedSlots: Record<string, any> = {};
        // biome-ignore lint/suspicious/noExplicitAny: Legacy theme format handling
        Object.entries(slots).forEach(([slotId, slot]: [string, any]) => {
            normalizedSlots[slotId] = {
                hex: slot.hex,
                ids: slot.ids || slot.paths || [],
            };
        });
        const llmTheme = {
            slots: normalizedSlots,
            borderRadius: parsed.borderRadius,
            fonts: parsed.fonts,
            opacity: parsed.opacity,
        };
        return themeToDictionary(llmTheme);
    }

    // Legacy dictionary format: { "#hex": ["token.a", "token.b"] }
    // biome-ignore lint/suspicious/noExplicitAny: Legacy theme format handling
    const legacySlots: Record<string, any> = {};
    // biome-ignore lint/suspicious/noExplicitAny: Legacy theme format handling
    Object.entries(parsed as Record<string, any>).forEach(
        ([hex, ids], index) => {
            legacySlots[`slot_${index}`] = {
                hex,
                ids: Array.isArray(ids) ? ids : [ids],
            };
        },
    );

    return themeToDictionary({
        slots: legacySlots,
        borderRadius: parsed.borderRadius,
        fonts: parsed.fonts,
        opacity: parsed.opacity,
    });
}

// ==============================================
// THEME GENERATION HELPERS
// ==============================================

/**
 * Generate theme (colors + borderRadius)
 */
export async function generateTheme(
    userPrompt: string,
    apiKey?: string,
    model?: string,
): Promise<ThemeDictionary> {
    const fullPrompt = `${STYLING_GUIDELINES}

USER REQUEST:
${userPrompt}

Generate the theme JSON now:`;

    console.log("🎨 [DESIGNER] → Requesting theme tokens...");
    const text = await generateText(fullPrompt, undefined, model, apiKey);
    console.log("🎨 [DESIGNER] ← Theme tokens received");
    return parseThemeResponse(text);
}

// ==============================================
// COPY GENERATION HELPERS
// ==============================================

// Copy types moved to buildPrompts.ts

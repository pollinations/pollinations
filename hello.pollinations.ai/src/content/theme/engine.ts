// ==============================================
// TYPES
// ==============================================

import type { SemanticTokenId } from "./semantic";

export interface ThemeSlot {
    hex: string;
    ids: SemanticTokenId[];
}

export interface LLMThemeResponse {
    slots: Record<string, ThemeSlot>;
    borderRadius?: Record<string, string>;
    fonts?: Record<string, string>;
}

export interface ThemeEngineOutput {
    cssVariables: Record<string, string>;
}

export interface ThemeDictionary {
    colors: Record<string, string[]>;
    borderRadius?: Record<string, string>;
    fonts?: Record<string, string>;
}

// ==============================================
// LLM RESPONSE → CSS VARIABLES
// ==============================================

export function processTheme(theme: LLMThemeResponse): ThemeEngineOutput {
    const cssVariables: Record<string, string> = {};
    const tokenIdToHex: Record<string, string> = {};

    Object.values(theme.slots).forEach((slot) => {
        const ids = Array.isArray(slot.ids) ? slot.ids : [slot.ids];
        ids.forEach((id) => {
            const varName = `--${id.replace(/\./g, "-")}`;
            cssVariables[varName] = slot.hex;
            tokenIdToHex[id] = slot.hex;
        });
    });

    if (theme.borderRadius) {
        Object.entries(theme.borderRadius).forEach(([id, value]) => {
            cssVariables[`--${id.replace(/\./g, "-")}`] = value;
            tokenIdToHex[id] = value;
        });
    }

    if (theme.fonts) {
        Object.entries(theme.fonts).forEach(([id, value]) => {
            cssVariables[`--${id.replace(/\./g, "-")}`] = `'${value}'`;
            tokenIdToHex[id] = `'${value}'`;
        });
    }

    return { cssVariables };
}

// ==============================================
// APPLY THEME TO DOM
// ==============================================

export function applyTheme(theme: LLMThemeResponse) {
    const { cssVariables } = processTheme(theme);
    const root = document.documentElement;

    Object.entries(cssVariables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
}

// ==============================================
// FORMAT CONVERSIONS (for React state)
// ==============================================

/**
 * Convert LLM slot format to flat dictionary structure.
 * Used by ThemeContext for React state management.
 */
export function themeToDictionary(theme: LLMThemeResponse): ThemeDictionary {
    const colors: Record<string, string[]> = {};
    Object.values(theme.slots).forEach((slot) => {
        if (!colors[slot.hex]) {
            colors[slot.hex] = [];
        }
        const ids = Array.isArray(slot.ids) ? slot.ids : [slot.ids];
        colors[slot.hex].push(...ids);
    });

    return {
        colors,
        borderRadius: theme.borderRadius,
        fonts: theme.fonts,
    };
}

/**
 * Convert flat dictionary back to LLM slot format.
 * Used by ThemeContext when applying user-edited themes.
 */
export function dictionaryToTheme(dict: ThemeDictionary): LLMThemeResponse {
    const slots: Record<string, ThemeSlot> = {};
    Object.entries(dict.colors).forEach(([hex, ids], index) => {
        slots[`slot_${index}`] = { hex, ids: ids as SemanticTokenId[] };
    });

    return {
        slots,
        borderRadius: dict.borderRadius,
        fonts: dict.fonts,
    };
}

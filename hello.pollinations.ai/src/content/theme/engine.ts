import type { TokenId } from "./tokens";

// ==============================================
// TYPES
// ==============================================

export interface ThemeSlot {
    hex: string;
    ids: TokenId[];
}

export interface LLMThemeResponse {
    slots: Record<string, ThemeSlot>;
    borderRadius?: Record<string, string>;
}

export interface ThemeEngineOutput {
    cssVariables: Record<string, string>;
}

export interface ThemeDictionary {
    colors: Record<string, TokenId[]>;
    borderRadius?: Record<string, string>;
}

// ==============================================
// LLM RESPONSE → CSS VARIABLES
// ==============================================

export function processTheme(theme: LLMThemeResponse): ThemeEngineOutput {
    const cssVariables: Record<string, string> = {};

    // Flatten slots to ID → Hex mapping and set CSS variables
    Object.values(theme.slots).forEach((slot) => {
        const ids = Array.isArray(slot.ids) ? slot.ids : [slot.ids];
        ids.forEach((id) => {
            cssVariables[`--${id}`] = slot.hex;
        });
    });

    // Handle Border Radius (with defaults)
    const defaultRadius = {
        "t038": "8px", // button
        "t039": "12px", // card
        "t040": "8px", // input
    };

    const radius = { ...defaultRadius, ...theme.borderRadius };

    Object.entries(radius).forEach(([id, value]) => {
        cssVariables[`--${id}`] = value;
    });

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
    const colors: Record<string, TokenId[]> = {};
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
    };
}

/**
 * Convert flat dictionary back to LLM slot format.
 * Used by ThemeContext when applying user-edited themes.
 */
export function dictionaryToTheme(dict: ThemeDictionary): LLMThemeResponse {
    const slots: Record<string, ThemeSlot> = {};
    Object.entries(dict.colors).forEach(([hex, ids], index) => {
        slots[`slot_${index}`] = { hex, ids };
    });

    return {
        slots,
        borderRadius: dict.borderRadius,
    };
}

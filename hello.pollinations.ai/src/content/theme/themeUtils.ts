import { TokenId, TOKENS } from "./tokens";

export interface ThemeSlot {
    hex: string;
    ids: TokenId[];
}

export interface LLMThemeResponse {
    slots: Record<string, ThemeSlot>;
}

export interface ThemeEngineOutput {
    cssVariables: Record<string, string>;
}

// Helper to get token label by ID
export function getTokenLabel(id: string): string | undefined {
    return TOKENS.find((t) => t.id === id)?.label;
}

export function processTheme(theme: LLMThemeResponse): ThemeEngineOutput {
    const cssVariables: Record<string, string> = {};

    // Flatten slots to ID -> Hex mapping and set CSS variables
    Object.values(theme.slots).forEach((slot) => {
        const ids = Array.isArray(slot.ids) ? slot.ids : [slot.ids];
        ids.forEach((id) => {
            // Set CSS variable
            cssVariables[`--${id}`] = slot.hex;
        });
    });

    return { cssVariables };
}

export function applyTheme(theme: LLMThemeResponse) {
    const { cssVariables } = processTheme(theme);
    const root = document.documentElement;

    Object.entries(cssVariables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
}

// Convert LLMThemeResponse to a flat dictionary { hex: [ids] }
// This is useful for the ColorPicker and Context state
export function themeToDictionary(
    theme: LLMThemeResponse,
): Record<string, TokenId[]> {
    const dict: Record<string, TokenId[]> = {};
    Object.values(theme.slots).forEach((slot) => {
        if (!dict[slot.hex]) {
            dict[slot.hex] = [];
        }
        const ids = Array.isArray(slot.ids) ? slot.ids : [slot.ids];
        dict[slot.hex].push(...ids);
    });
    return dict;
}

// Convert flat dictionary back to LLMThemeResponse
export function dictionaryToTheme(
    dict: Record<string, TokenId[]>,
): LLMThemeResponse {
    const slots: Record<string, ThemeSlot> = {};
    Object.entries(dict).forEach(([hex, ids], index) => {
        slots[`slot_${index}`] = { hex, ids };
    });
    return { slots };
}

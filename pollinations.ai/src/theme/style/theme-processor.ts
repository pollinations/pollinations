// ==============================================
// TYPES
// ==============================================

import { TOKENS } from "./design-tokens";
import type { SemanticTokenId } from "./semantic-ids.types";

// Helpers for validation/normalization
const HEX_REGEX = /^#?[0-9a-fA-F]{6}$/;
const LENGTHY_VALUE = 200;

const ALL_TOKENS: SemanticTokenId[] = TOKENS.map(
    (t) => t.id,
) as SemanticTokenId[];
const TOKEN_SET = new Set<SemanticTokenId>(ALL_TOKENS);

const toCssVar = (id: string) => `--${id.replace(/\./g, "-")}`;

const normalizeHex = (value: string | undefined): string | null => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!HEX_REGEX.test(trimmed)) return null;
    return trimmed.startsWith("#") ? trimmed.slice(0, 7) : `#${trimmed}`;
};

const hexToRgb = (hex: string): string | null => {
    const normalized = normalizeHex(hex);
    if (!normalized) return null;
    const r = Number.parseInt(normalized.slice(1, 3), 16);
    const g = Number.parseInt(normalized.slice(3, 5), 16);
    const b = Number.parseInt(normalized.slice(5, 7), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return `${r} ${g} ${b}`;
};

const normalizeRadius = (value: string | undefined): string | null => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > LENGTHY_VALUE) return null;
    // Allow px, rem, em, %, plain numbers default to px
    if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
    if (/^\d+(\.\d+)?(px|rem|em|%)$/i.test(trimmed)) return trimmed;
    return null;
};

const normalizeFont = (value: string | undefined): string | null => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.replace(/^['"]|['"]$/g, "").trim();
    if (!trimmed || trimmed.length > LENGTHY_VALUE) return null;
    // Basic safety: allow letters/numbers/space/dash only
    if (!/^[\w\s-]+$/.test(trimmed)) return null;
    return trimmed;
};

const normalizeOpacity = (value: string | undefined): string | null => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim();
    const num = Number.parseFloat(trimmed);
    // Validate opacity is between 0 and 1
    if (Number.isNaN(num) || num < 0 || num > 1) return null;
    return num.toString();
};

const isSemanticToken = (id: string): id is SemanticTokenId =>
    TOKEN_SET.has(id as SemanticTokenId);

const normalizeSlotIds = (
    ids: SemanticTokenId | SemanticTokenId[],
): SemanticTokenId[] => {
    const list = Array.isArray(ids) ? ids : [ids];
    return list.filter((id): id is SemanticTokenId => isSemanticToken(id));
};

export interface ThemeSlot {
    hex: string;
    ids: SemanticTokenId[];
}

export interface LLMThemeResponse {
    slots: Record<string, ThemeSlot>;
    borderRadius?: Record<string, string>;
    fonts?: Record<string, string>;
    opacity?: Record<string, string>;
}

export interface ThemeEngineOutput {
    cssVariables: Record<string, string>;
}

export interface ThemeDictionary {
    colors: Array<{ hex: string; ids: SemanticTokenId[] }>;
    borderRadius?: Record<string, string>;
    fonts?: Record<string, string>;
    opacity?: Record<string, string>;
}

// ==============================================
// LLM RESPONSE → CSS VARIABLES
// ==============================================

export function processTheme(theme: LLMThemeResponse): ThemeEngineOutput {
    const cssVariables: Record<string, string> = {};

    Object.values(theme.slots).forEach((slot) => {
        const hex = normalizeHex(slot.hex);
        if (!hex) return;
        const rgb = hexToRgb(hex);
        if (!rgb) return;
        const ids = normalizeSlotIds(slot.ids);
        ids.forEach((id) => {
            cssVariables[toCssVar(id)] = rgb; // Store as RGB only
        });
    });

    if (theme.borderRadius) {
        Object.entries(theme.borderRadius).forEach(([id, value]) => {
            const normalized = normalizeRadius(value);
            if (normalized && isSemanticToken(id)) {
                cssVariables[toCssVar(id)] = normalized;
            }
        });
    }

    if (theme.fonts) {
        Object.entries(theme.fonts).forEach(([id, value]) => {
            const normalized = normalizeFont(value);
            if (normalized && isSemanticToken(id)) {
                cssVariables[toCssVar(id)] = `'${normalized}'`;
            }
        });
    }

    if (theme.opacity) {
        Object.entries(theme.opacity).forEach(([id, value]) => {
            const normalized = normalizeOpacity(value);
            if (normalized && isSemanticToken(id)) {
                cssVariables[toCssVar(id)] = normalized;
            }
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

    // Clear stale values so missing tokens don't inherit old inline styles
    ALL_TOKENS.forEach((id) => {
        root.style.removeProperty(toCssVar(id));
    });

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
    const colors: Array<{ hex: string; ids: SemanticTokenId[] }> = [];

    Object.entries(theme.slots)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([, slot]) => {
            const hex = normalizeHex(slot.hex);
            const ids = normalizeSlotIds(slot.ids);
            if (!hex || ids.length === 0) return;
            colors.push({ hex, ids });
        });

    const borderRadius: Record<string, string> = {};
    Object.entries(theme.borderRadius || {}).forEach(([id, value]) => {
        const normalized = normalizeRadius(value);
        if (normalized && isSemanticToken(id)) {
            borderRadius[id] = normalized;
        }
    });

    const fonts: Record<string, string> = {};
    Object.entries(theme.fonts || {}).forEach(([id, value]) => {
        const normalized = normalizeFont(value);
        if (normalized && isSemanticToken(id)) {
            fonts[id] = normalized;
        }
    });

    const opacity: Record<string, string> = {};
    Object.entries(theme.opacity || {}).forEach(([id, value]) => {
        const normalized = normalizeOpacity(value);
        if (normalized && isSemanticToken(id)) {
            opacity[id] = normalized;
        }
    });

    return { colors, borderRadius, fonts, opacity };
}

/**
 * Convert flat dictionary back to LLM slot format.
 * Used by ThemeContext when applying user-edited themes.
 */
export function dictionaryToTheme(dict: ThemeDictionary): LLMThemeResponse {
    const slots: Record<string, ThemeSlot> = {};
    dict.colors
        .map(({ hex, ids }) => ({
            hex: normalizeHex(hex),
            ids: normalizeSlotIds(ids),
        }))
        .filter(
            (bucket): bucket is { hex: string; ids: SemanticTokenId[] } =>
                Boolean(bucket.hex) && bucket.ids.length > 0,
        )
        .forEach((bucket, index) => {
            slots[`slot_${index}`] = {
                hex: bucket.hex,
                ids: bucket.ids,
            };
        });

    return {
        slots,
        borderRadius: dict.borderRadius,
        fonts: dict.fonts,
        opacity: dict.opacity,
    };
}

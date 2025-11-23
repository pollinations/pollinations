import type { ThemeDictionary } from "../../../../content/theme";
import type { ThemeState, RadiusState, FontState } from "../types";
import type { MacroConfig } from "../../../../content/theme/macros";
import { RADIUS_TOKENS, FONT_TOKENS } from "./token-helpers";

// Convert dictionary format to bucket format
export const convertToThemeState = (dict: ThemeDictionary): ThemeState => {
    const newState: ThemeState = {};
    Object.entries(dict.colors).forEach(([color, tokens], index) => {
        newState[`bucket-${index}`] = { color, tokens };
    });
    return newState;
};

// Convert radius dictionary to bucket format (2 value buckets, dynamic tokens from TOKENS)
export const convertRadiusToState = (
    radiusDict: Record<string, string>,
): RadiusState => {
    const allRadiusTokens = RADIUS_TOKENS;

    // Group tokens by their current radius value
    const valueGroups: Record<string, string[]> = {};
    allRadiusTokens.forEach((tokenId) => {
        const value = radiusDict[tokenId] || "0px";
        if (!valueGroups[value]) {
            valueGroups[value] = [];
        }
        valueGroups[value].push(tokenId);
    });

    // Create buckets from groups (max 2 buckets)
    const newState: RadiusState = {};
    const values = Object.keys(valueGroups).slice(0, 2); // Take first 2 unique values

    values.forEach((value, index) => {
        newState[`radius-bucket-${index}`] = {
            value,
            tokens: valueGroups[value],
        };
    });

    // If we have fewer than 2 buckets, add empty ones
    if (Object.keys(newState).length < 2) {
        for (let i = Object.keys(newState).length; i < 2; i++) {
            newState[`radius-bucket-${i}`] = {
                value: "0px",
                tokens: [],
            };
        }
    }

    return newState;
};

// Convert radius buckets back to dictionary format (for export)
export const convertRadiusToDict = (
    radiusState: RadiusState,
): Record<string, string> => {
    const dict: Record<string, string> = {};
    Object.values(radiusState).forEach((bucket) => {
        bucket.tokens.forEach((tokenId) => {
            dict[tokenId] = bucket.value;
        });
    });
    return dict;
};

// Convert font dictionary to bucket format (one bucket per token)
export const convertFontsToState = (
    fontDict: Record<string, string>,
): FontState => {
    const fontTokens = FONT_TOKENS;
    const newState: FontState = {};

    const defaultFonts: Record<string, string> = {
        "font.title": "Maven Pro",
        "font.headline": "Mako",
        "font.body": "Duru Sans",
    };

    fontTokens.forEach((tokenId, index) => {
        newState[`font-bucket-${index}`] = {
            value: fontDict[tokenId] || defaultFonts[tokenId] || "Duru Sans",
            tokens: [tokenId],
        };
    });

    return newState;
};

// Convert font buckets back to dictionary format (for export)
export const convertFontsToDict = (
    fontState: FontState,
): Record<string, string> => {
    const dict: Record<string, string> = {};
    Object.values(fontState).forEach((bucket) => {
        bucket.tokens.forEach((tokenId) => {
            dict[tokenId] = bucket.value;
        });
    });
    return dict;
};

/**
 * Convert bucket state to MacroConfig format for preset export
 * Creates a clean, organized structure matching our preset files
 */
export const convertToMacroConfig = (
    theme: ThemeState,
    radius: RadiusState,
    fonts: FontState,
): MacroConfig => {
    // Build lookup maps for efficient access
    const colorMap = new Map<string, string>();
    Object.values(theme).forEach((bucket) => {
        bucket.tokens.forEach((tokenId) => {
            colorMap.set(tokenId, bucket.color);
        });
    });

    const radiusMap = new Map<string, string>();
    Object.values(radius).forEach((bucket) => {
        bucket.tokens.forEach((tokenId) => {
            radiusMap.set(tokenId, bucket.value);
        });
    });

    const fontMap = new Map<string, string>();
    Object.values(fonts).forEach((bucket) => {
        bucket.tokens.forEach((tokenId) => {
            fontMap.set(tokenId, bucket.value);
        });
    });

    // Helper accessors with fallbacks
    const getColor = (tokenId: string): string =>
        colorMap.get(tokenId) || "#000000";
    const getRadius = (tokenId: string): string =>
        radiusMap.get(tokenId) || "0px";
    const getFont = (tokenId: string): string =>
        fontMap.get(tokenId) || "Duru Sans";

    return {
        text: {
            primary: getColor("text.primary"),
            secondary: getColor("text.secondary"),
            tertiary: getColor("text.tertiary"),
            caption: getColor("text.caption"),
            inverse: getColor("text.inverse"),
            highlight: getColor("text.highlight"),
        },
        surfaces: {
            page: getColor("surface.page"),
            card: getColor("surface.card"),
            base: getColor("surface.base"),
        },
        inputs: {
            bg: getColor("input.bg"),
            border: getColor("input.border"),
            placeholder: getColor("input.placeholder"),
        },
        buttons: {
            primary: {
                bg: getColor("button.primary.bg"),
                border: getColor("button.primary.border"),
            },
            secondary: {
                bg: getColor("button.secondary.bg"),
                border: getColor("button.secondary.border"),
            },
            ghost: {
                disabledBg: getColor("button.disabled.bg"),
                hoverOverlay: getColor("button.hover.overlay"),
                activeOverlay: getColor("button.active.overlay"),
                focusRing: getColor("button.focus.ring"),
            },
        },
        borders: {
            highlight: getColor("border.highlight"),
            main: getColor("border.main"),
            strong: getColor("border.strong"),
            subtle: getColor("border.subtle"),
            faint: getColor("border.faint"),
        },
        shadows: {
            brand: {
                sm: getColor("shadow.brand.sm"),
                md: getColor("shadow.brand.md"),
                lg: getColor("shadow.brand.lg"),
            },
            dark: {
                sm: getColor("shadow.dark.sm"),
                md: getColor("shadow.dark.md"),
                lg: getColor("shadow.dark.lg"),
                xl: getColor("shadow.dark.xl"),
            },
            highlight: {
                sm: getColor("shadow.highlight.sm"),
                md: getColor("shadow.highlight.md"),
            },
        },
        brandSpecial: {
            brandMain: getColor("border.brand"), // Maps to both text.brand and border.brand
            logoMain: getColor("logo.main"),
            logoAccent: getColor("logo.accent"),
            indicatorImage: getColor("indicator.image"),
            indicatorText: getColor("indicator.text"),
            indicatorAudio: getColor("indicator.audio"),
        },
        typography: {
            title: getFont("font.title"),
            headline: getFont("font.headline"),
            body: getFont("font.body"),
        },
        radius: {
            button: getRadius("radius.button"),
            card: getRadius("radius.card"),
            input: getRadius("radius.input"),
            subcard: getRadius("radius.subcard"),
        },
    };
};

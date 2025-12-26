import type { ThemeDictionary } from "../../../../theme/style";
import type {
    FontState,
    OpacityState,
    RadiusState,
    ThemeState,
} from "../types";

// Convert dictionary format to bucket format
export const convertToThemeState = (dict: ThemeDictionary): ThemeState => {
    const newState: ThemeState = {};
    dict.colors.forEach((bucket, index) => {
        newState[`bucket-${index}`] = {
            color: bucket.hex,
            tokens: bucket.ids,
        };
    });
    return newState;
};

// Convert radius dictionary to bucket format (2 value buckets, 4 tokens can be assigned)
export const convertRadiusToState = (
    radiusDict: Record<string, string>,
): RadiusState => {
    const allRadiusTokens: string[] = [
        "radius.button",
        "radius.card",
        "radius.input",
        "radius.subcard",
    ];

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

// Convert font dictionary to bucket format (fixed 3 buckets, one per token)
export const convertFontsToState = (
    fontDict: Record<string, string>,
): FontState => {
    const fontTokens: string[] = ["font.title", "font.headline", "font.body"];
    const newState: FontState = {};

    fontTokens.forEach((tokenId, index) => {
        newState[`font-bucket-${index}`] = {
            value:
                fontDict[tokenId] ||
                (index === 0
                    ? "Maven Pro"
                    : index === 1
                      ? "Mako"
                      : "Duru Sans"),
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

// Convert opacity dictionary to bucket format (fixed 3 buckets, one per token)
export const convertOpacityToState = (
    opacityDict: Record<string, string>,
): OpacityState => {
    const opacityTokens: string[] = [
        "opacity.card",
        "opacity.overlay",
        "opacity.glass",
    ];
    const newState: OpacityState = {};

    opacityTokens.forEach((tokenId, index) => {
        newState[`opacity-bucket-${index}`] = {
            value:
                opacityDict[tokenId] ||
                (index === 0 ? "0.95" : index === 1 ? "0.85" : "0.75"),
            tokens: [tokenId],
        };
    });

    return newState;
};

// Convert opacity buckets back to dictionary format (for export)
export const convertOpacityToDict = (
    opacityState: OpacityState,
): Record<string, string> => {
    const dict: Record<string, string> = {};
    Object.values(opacityState).forEach((bucket) => {
        bucket.tokens.forEach((tokenId) => {
            dict[tokenId] = bucket.value;
        });
    });
    return dict;
};

// Convert all local state back to ThemeDictionary format (for syncing to context)
export const convertStateToThemeDictionary = (
    themeState: ThemeState,
    radiusState: RadiusState,
    fontState: FontState,
    opacityState: OpacityState,
): ThemeDictionary => {
    // Convert color buckets to array format
    const colors = Object.values(themeState).map((bucket) => ({
        hex: bucket.color,
        ids: bucket.tokens as ThemeDictionary["colors"][0]["ids"],
    }));

    return {
        colors,
        borderRadius: convertRadiusToDict(radiusState),
        fonts: convertFontsToDict(fontState),
        opacity: convertOpacityToDict(opacityState),
    };
};

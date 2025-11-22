import type { ThemeDictionary } from "../../../../content/theme";
import type { ThemeState, RadiusState, FontState } from "../types";

// Convert dictionary format to bucket format
export const convertToThemeState = (dict: ThemeDictionary): ThemeState => {
    const newState: ThemeState = {};
    Object.entries(dict.colors).forEach(([color, tokens], index) => {
        newState[`bucket-${index}`] = { color, tokens };
    });
    return newState;
};

// Convert radius dictionary to bucket format (2 value buckets, 4 tokens can be assigned)
export const convertRadiusToState = (
    radiusDict: Record<string, string>,
): RadiusState => {
    const allRadiusTokens: string[] = ["t038", "t039", "t040", "t044"]; // Button, Card, Input, Sub-Card

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
    const fontTokens: string[] = ["t041", "t042", "t043"]; // Title, Headline, Body
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

import type { TokenId } from "../../../content/theme";

export interface ColorBucketData {
    color: string;
    tokens: TokenId[];
}

export interface RadiusBucketData {
    value: string; // e.g., "0px", "8px", "16px"
    tokens: TokenId[]; // Radius tokens: t038, t039, t040, t044 (draggable between 2 buckets)
}

export interface FontBucketData {
    value: string; // e.g., "Maven Pro", "Mako", "Duru Sans"
    tokens: TokenId[]; // Font tokens: t041, t042, t043
}

export type ThemeState = Record<string, ColorBucketData>;
export type RadiusState = Record<string, RadiusBucketData>;
export type FontState = Record<string, FontBucketData>;

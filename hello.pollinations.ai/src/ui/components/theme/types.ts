export interface ColorBucketData {
    color: string;
    tokens: string[];
}

export interface RadiusBucketData {
    value: string; // e.g., "0px", "8px", "16px"
    tokens: string[]; // Radius tokens: radius.button, radius.card, radius.input, radius.subcard
}

export interface FontBucketData {
    value: string; // e.g., "Maven Pro", "Mako", "Duru Sans"
    tokens: string[]; // Font tokens: font.title, font.headline, font.body
}

export type ThemeState = Record<string, ColorBucketData>;
export type RadiusState = Record<string, RadiusBucketData>;
export type FontState = Record<string, FontBucketData>;

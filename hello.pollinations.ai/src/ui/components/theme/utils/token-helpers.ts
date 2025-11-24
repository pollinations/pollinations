import { TOKENS } from "../../../../content/theme/design-tokens";

// PresetEditor dev tool helper - get human-readable token label
export const getTokenLabel = (id: string): string | undefined => {
    return TOKENS.find((t) => t.id === id)?.description;
};

// Token type constants
// Token type constants
export const RADIUS_TOKENS = TOKENS.filter((t) => t.type === "radius").map(
    (t) => t.id,
);
export const FONT_TOKENS = TOKENS.filter((t) => t.type === "font").map(
    (t) => t.id,
);
export const COLOR_TOKENS = TOKENS.filter((t) => t.type === "color").map(
    (t) => t.id,
);

export const isRadiusToken = (token: string): boolean => {
    return (RADIUS_TOKENS as readonly string[]).includes(token);
};

export const isFontToken = (token: string): boolean => {
    return (FONT_TOKENS as readonly string[]).includes(token);
};

export const isColorToken = (token: string): boolean => {
    return (COLOR_TOKENS as readonly string[]).includes(token);
};

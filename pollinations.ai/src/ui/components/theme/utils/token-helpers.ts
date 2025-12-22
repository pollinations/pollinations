import { TOKENS } from "../../../../theme/style/design-tokens";

// PresetEditor dev tool helper - get human-readable token label
export const getTokenLabel = (id: string): string | undefined => {
    return TOKENS.find((t) => t.id === id)?.description;
};

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
export const OPACITY_TOKENS = TOKENS.filter((t) => t.type === "opacity").map(
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

export const isOpacityToken = (token: string): boolean => {
    return (OPACITY_TOKENS as readonly string[]).includes(token);
};

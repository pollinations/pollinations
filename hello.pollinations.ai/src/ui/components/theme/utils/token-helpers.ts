import { TOKENS } from "../../../../content/theme/tokens";

// PresetEditor dev tool helper - get human-readable token label
export const getTokenLabel = (id: string): string | undefined => {
    return TOKENS.find((t) => t.id === id)?.description;
};

// Token type constants
export const RADIUS_TOKENS = ["t038", "t039", "t040", "t044"] as const;
export const FONT_TOKENS = ["t041", "t042", "t043"] as const;
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
    return COLOR_TOKENS.includes(token as `t${number}`);
};

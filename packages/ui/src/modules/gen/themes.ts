/** Pollinations model modality to package theme mapping. */
import type { ModelCategory } from "@pollinations/sdk";
import type { ThemeName } from "../../theme.ts";

/** A model modality is just a model category. Single source of truth: the SDK. */
export type Modality = ModelCategory;

export const MODALITY_THEMES: Record<ModelCategory, ThemeName> = {
    text: "blue",
    image: "pink",
    video: "teal",
    audio: "amber",
    realtime: "coral",
    embedding: "violet",
};

/** Theme for a known model category. Total — every category has a theme. */
export function modalityTheme(category: ModelCategory): ThemeName {
    return MODALITY_THEMES[category];
}

/** Map a human-typed category string to the canonical `ModelCategory` key. */
function normalize(category: string): ModelCategory | null {
    const lower = category.toLowerCase();
    if (lower === "images") return "image";
    if (lower === "embeddings") return "embedding";
    return lower in MODALITY_THEMES ? (lower as ModelCategory) : null;
}

/** Theme for an untrusted category string (e.g. user input); null if unknown. */
export function getModalityTheme(category: string): ThemeName | null {
    const key = normalize(category);
    return key ? MODALITY_THEMES[key] : null;
}

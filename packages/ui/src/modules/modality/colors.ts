/**
 * Single source of truth for modality colors.
 *
 * Each modality (text/image/video/audio/realtime/embedding) maps to one
 * package theme. Class recipes are token-based, so callers should pass the
 * returned `theme` to the primitive or set `data-theme` on an ancestor.
 * Used by apps to compose model-selection buttons and static modality chips.
 * This module only owns modality color data; primitives own shape and behavior.
 */
import type { ThemeName } from "../../theme.ts";

export type Modality =
    | "text"
    | "image"
    | "video"
    | "audio"
    | "realtime"
    | "embedding";

export type ModalityColorSet = {
    /** Matching package theme for surfaces/chips that should inherit this hue. */
    theme: ThemeName;
    /** Selected/filled state using the active theme tokens. */
    filled: string;
    /** Hover hint shown on the unselected button using the active theme. */
    hover: string;
    /** Heading text colour using the active theme. */
    text: string;
};

const filled = "polli:bg-theme-bg-active polli:text-theme-text-strong";
const hover =
    "polli:hover:bg-theme-bg-subtle polli:hover:text-theme-text-strong";
const text = "polli:text-theme-text-strong";

// No borders — chips and buttons in this system are borderless.
export const MODALITY_COLORS: Record<Modality, ModalityColorSet> = {
    text: {
        theme: "blue",
        filled,
        hover,
        text,
    },
    image: {
        theme: "pink",
        filled,
        hover,
        text,
    },
    video: {
        theme: "teal",
        filled,
        hover,
        text,
    },
    audio: {
        theme: "violet",
        filled,
        hover,
        text,
    },
    realtime: {
        theme: "green",
        filled,
        hover,
        text,
    },
    embedding: {
        theme: "amber",
        filled,
        hover,
        text,
    },
};

/** Map any human-typed category string to the canonical `Modality` key. */
function normalize(category: string): Modality | null {
    const lower = category.toLowerCase();
    if (lower === "images") return "image";
    if (lower === "embeddings") return "embedding";
    if (
        lower === "text" ||
        lower === "image" ||
        lower === "video" ||
        lower === "audio" ||
        lower === "realtime" ||
        lower === "embedding"
    ) {
        return lower;
    }
    return null;
}

export function getModalityColors(category: string): ModalityColorSet | null {
    const key = normalize(category);
    return key ? MODALITY_COLORS[key] : null;
}

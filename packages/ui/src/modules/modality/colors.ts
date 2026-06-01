/**
 * Single source of truth for modality colors.
 *
 * Each modality (text/image/video/audio/realtime/embedding) gets one
 * page-theme hue, applied at the soft `-200/-900/-400` chip recipe.
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
    /** Selected/filled state: `bg + text + border` classes. */
    filled: string;
    /** Hover hint shown on the unselected button (subtle tint). */
    hover: string;
    /** Heading text colour for the category label. */
    text: string;
};

// No borders — chips and buttons in this system are borderless.
export const MODALITY_COLORS: Record<Modality, ModalityColorSet> = {
    text: {
        theme: "blue",
        filled: "polli:bg-blue-200 polli:text-blue-900",
        hover: "polli:hover:bg-blue-100 polli:hover:text-blue-900",
        text: "polli:text-blue-800",
    },
    image: {
        theme: "pink",
        filled: "polli:bg-pink-200 polli:text-pink-900",
        hover: "polli:hover:bg-pink-100 polli:hover:text-pink-900",
        text: "polli:text-pink-800",
    },
    video: {
        theme: "teal",
        filled: "polli:bg-teal-200 polli:text-teal-900",
        hover: "polli:hover:bg-teal-100 polli:hover:text-teal-900",
        text: "polli:text-teal-800",
    },
    audio: {
        theme: "violet",
        filled: "polli:bg-violet-200 polli:text-violet-900",
        hover: "polli:hover:bg-violet-100 polli:hover:text-violet-900",
        text: "polli:text-violet-800",
    },
    realtime: {
        theme: "green",
        filled: "polli:bg-green-200 polli:text-green-900",
        hover: "polli:hover:bg-green-100 polli:hover:text-green-900",
        text: "polli:text-green-800",
    },
    embedding: {
        theme: "amber",
        filled: "polli:bg-amber-200 polli:text-amber-900",
        hover: "polli:hover:bg-amber-100 polli:hover:text-amber-900",
        text: "polli:text-amber-800",
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

/**
 * Single source of truth for modality colors.
 *
 * Each of the 5 modalities (text/image/video/audio/embedding) gets one
 * page-theme hue, applied at the soft `-200/-900/-400` chip recipe.
 * Used in two places:
 *   1. The model-selection buttons in the API key creation flow.
 *   2. The static modality chips on the OAuth authorize screen.
 *
 * Both consumers render with `rounded-lg` shape so they match the rest
 * of the design system. Page-theme hues only — no rogue indigo/rose.
 */
export type Modality = "text" | "image" | "video" | "audio" | "embedding";

type ModalityColorSet = {
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
        filled: "bg-blue-200 text-blue-900",
        hover: "hover:bg-blue-100 hover:text-blue-900",
        text: "text-blue-800",
    },
    image: {
        filled: "bg-pink-200 text-pink-900",
        hover: "hover:bg-pink-100 hover:text-pink-900",
        text: "text-pink-800",
    },
    video: {
        filled: "bg-teal-200 text-teal-900",
        hover: "hover:bg-teal-100 hover:text-teal-900",
        text: "text-teal-800",
    },
    audio: {
        filled: "bg-violet-200 text-violet-900",
        hover: "hover:bg-violet-100 hover:text-violet-900",
        text: "text-violet-800",
    },
    embedding: {
        filled: "bg-amber-200 text-amber-900",
        hover: "hover:bg-amber-100 hover:text-amber-900",
        text: "text-amber-800",
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

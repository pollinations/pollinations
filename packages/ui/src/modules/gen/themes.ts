/** Pollinations model-modality colors. Single-accent model: modality is NOT a
 *  page theme — each modality is a fixed color from the `--polli-color-modality-*`
 *  tokens, applied as a dot/badge via inline style (the key is dynamic, so a CSS
 *  var beats a Tailwind class). The token VALUES live in styles/tokens.css. */
import type { ModelCategory } from "@pollinations/sdk";

/** The canonical modality keys (match the `--polli-color-modality-*` tokens). */
type ModalityKey = ModelCategory;

const MODALITIES: readonly ModelCategory[] = [
    "text",
    "image",
    "video",
    "audio",
    "realtime",
    "embedding",
];

/** Map an untrusted category string to its modality key; null if unknown. */
export function getModalityKey(category: string): ModalityKey | null {
    const lower = category.toLowerCase();
    if (lower === "images") return "image";
    if (lower === "embeddings") return "embedding";
    return MODALITIES.includes(lower as ModelCategory)
        ? (lower as ModelCategory)
        : null;
}

/** CSS var for a modality's solid color (dot / border / icon). */
export const modalityColorVar = (key: ModalityKey): string =>
    `var(--polli-color-modality-${key})`;

/** CSS var for a modality's faint chip background. */
export const modalityBgVar = (key: ModalityKey): string =>
    `var(--polli-color-modality-${key}-bg)`;

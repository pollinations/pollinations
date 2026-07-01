import type { ImageModelName } from "@shared/registry/image.ts";

const DEFAULT_IMAGE_SIDE_LENGTH = 1024;

// Only models whose default dimensions differ from the global 1024 square need
// local image-parameter config. Model availability and media type live in the
// shared registry.
export const IMAGE_DEFAULT_SIDE_LENGTHS: Partial<
    Record<ImageModelName, number>
> = {
    seedream5: 2048,
    "seedream-pro": 2048,
    "ideogram-v4-turbo": 2048,
    "ideogram-v4-balanced": 2048,
    "ideogram-v4-quality": 2048,
    "nanobanana-pro": 2048,
    gptimage: 1021,
    "wan-image-pro": 2048,
};

export function getDefaultSideLength(model: ImageModelName): number {
    return IMAGE_DEFAULT_SIDE_LENGTHS[model] ?? DEFAULT_IMAGE_SIDE_LENGTH;
}

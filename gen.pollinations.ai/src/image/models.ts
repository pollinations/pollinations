import type { ImageModelName } from "@shared/registry/image.ts";

const DEFAULT_IMAGE_SIDE_LENGTH = 1024;

// Only models whose default dimensions differ from the global 1024 square need
// local image-parameter config. Model availability and media type live in the
// shared registry.
export const IMAGE_DEFAULT_SIDE_LENGTHS: Partial<
    Record<ImageModelName, number>
> = {
    "bytedance/seedream-5-lite": 2048,
    "bytedance/seedream-5-pro": 2048,
    "bytedance-seed/seedream-4.5": 2048,
    "ideogram-ai/ideogram-v4-turbo": 2048,
    "ideogram-ai/ideogram-v4-balanced": 2048,
    "ideogram-ai/ideogram-v4-quality": 2048,
    "google/gemini-3-pro-image": 2048,
    "openai/gpt-image-1-mini": 1021,
    "wan-video/wan-2.7-image-pro": 2048,
};

export function getDefaultSideLength(model: ImageModelName): number {
    return IMAGE_DEFAULT_SIDE_LENGTHS[model] ?? DEFAULT_IMAGE_SIDE_LENGTH;
}

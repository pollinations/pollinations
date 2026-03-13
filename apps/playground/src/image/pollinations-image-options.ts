/**
 * Available Pollinations image model IDs
 * Based on: https://gen.pollinations.ai/image/models
 */
export type PollinationsImageModelId =
  | 'kontext'
  | 'turbo'
  | 'nanobanana'
  | 'nanobanana-pro'
  | 'seedream'
  | 'seedream-pro'
  | 'gptimage'
  | 'gptimage-large'
  | 'flux'
  | 'zimage'
  | 'veo'
  | 'seedance'
  | 'seedance-pro'
  | string;

// Video model IDs (support aspectRatio, duration, audio)
export const VIDEO_MODELS: readonly PollinationsImageModelId[] = [
  'veo',
  'seedance',
  'seedance-pro',
] as const;

// GPT image models (support quality, transparent)
export const GPTIMAGE_MODELS: readonly PollinationsImageModelId[] = [
  'gptimage',
  'gptimage-large',
] as const;

/**
 * Check if a model ID is a video model
 */
export function isVideoModel(modelId: PollinationsImageModelId): boolean {
  return VIDEO_MODELS.includes(modelId);
}

/**
 * Check if a model ID is a GPT image model
 */
export function isGptImageModel(modelId: PollinationsImageModelId): boolean {
  return GPTIMAGE_MODELS.includes(modelId);
}

// Maximum number of images per call for Pollinations models
// Most models support generating 1 image at a time
export const modelMaxImagesPerCall: Record<
  Exclude<PollinationsImageModelId, string>,
  number
> = {
  kontext: 1,
  turbo: 1,
  nanobanana: 1,
  'nanobanana-pro': 1,
  seedream: 1,
  'seedream-pro': 1,
  gptimage: 1,
  'gptimage-large': 1,
  flux: 1,
  zimage: 1,
  veo: 1,
  seedance: 1,
  'seedance-pro': 1,
};

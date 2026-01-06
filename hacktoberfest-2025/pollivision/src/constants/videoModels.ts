import type { VideoModel } from '../types';

/**
 * Available video generation models from Pollinations.ai
 * Prices based on official Pollinations pricing (December 2024)
 * 
 * Video is in ALPHA 🧪
 */
export const VIDEO_MODELS: VideoModel[] = [
  {
    id: 'seedance',
    name: 'Seedance',
    description: 'Fast video generation with good quality. 1 pollen ≈ 15 seconds',
    pollenPerSecond: 0.067, // 1 pollen ≈ 15 seconds
    outputCostPerMillion: 1.8,
    quality: 'high',
    speed: 'fast',
    icon: '🎬',
    recommended: true,
  },
  {
    id: 'seedance-pro',
    name: 'Seedance Pro',
    description: 'High-quality video with better motion. 1 pollen ≈ 25 seconds',
    pollenPerSecond: 0.04, // 1 pollen ≈ 25 seconds
    outputCostPerMillion: 1.0,
    quality: 'ultra',
    speed: 'medium',
    icon: '✨',
  },
  {
    id: 'veo',
    name: 'Veo',
    description: 'Premium quality video generation. 0.15 pollen/second',
    pollenPerSecond: 0.15, // 0.15 pollen per second
    outputCostPerMillion: null,
    quality: 'ultra',
    speed: 'slow',
    icon: '🚀',
  },
];

/**
 * Calculate pollen cost for video generation
 * @param modelId - The model ID
 * @param durationSeconds - Video duration in seconds
 * @returns Pollen cost
 */
export function calculateVideoCost(modelId: string, durationSeconds: number = 5): number {
  const model = getVideoModelById(modelId);
  if (!model) return 0;
  
  return Math.ceil(model.pollenPerSecond * durationSeconds * 10) / 10;
}

/**
 * Get model by ID
 */
export function getVideoModelById(id: string): VideoModel | undefined {
  return VIDEO_MODELS.find((model) => model.id === id);
}

/**
 * Get default model (recommended or first)
 */
export function getDefaultVideoModel(): VideoModel {
  return VIDEO_MODELS.find((model) => model.recommended) || VIDEO_MODELS[0];
}

/**
 * Get models sorted by cost (cheapest first)
 */
export function getModelsSortedByCost(): VideoModel[] {
  return [...VIDEO_MODELS].sort((a, b) => a.pollenPerSecond - b.pollenPerSecond);
}

/**
 * Format cost display
 */
export function formatPollenCost(cost: number): string {
  if (cost < 1) {
    return cost.toFixed(2);
  }
  return cost.toFixed(1);
}




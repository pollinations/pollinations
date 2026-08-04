export type PollinationsModel = 'black-forest-labs/flux.1-kontext-pro' | 'openai/gpt-image-1-mini';


export interface KontextParams {
  model: 'black-forest-labs/flux.1-kontext-pro';
  prompt: string;
  imageUrl: string;
  width?: number;
  height?: number;
  seed?: number;
  nologo?: boolean;
}


export interface GPTImageParams {
  model: 'openai/gpt-image-1-mini';
  prompt: string;
  imageUrls: string[];
  width?: number;
  height?: number;
  seed?: number;
  nologo?: boolean;
}


export type TransformationParams = KontextParams | GPTImageParams;

export const DEFAULT_TRANSFORMATION_SETTINGS = {
  width: 1024,
  height: 1024,
  nologo: true,
  referer : 'com.ismafly.promptexploratorapp',
  //referer: 'com.ismafly.reimagine',
} as const;


export const TRANSFORMATION_MODELS = [
  {
    id: 'black-forest-labs/flux.1-kontext-pro' as const,
    name: 'Kontext',
    description: 'Transform a single image',
    imageCount: 1,
    maxImages: 1,
  },
  {
    id: 'openai/gpt-image-1-mini' as const,
    name: 'GPT Image',
    description: 'Mix 2-4 images together',
    imageCount: { min: 2, max: 4 },
    maxImages: 4,
  },
] as const;